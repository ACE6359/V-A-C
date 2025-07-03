from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from datetime import datetime
import os, json, logging, traceback
# Local module imports
from calculator import Calculator
from tts_engine import TTSEngine
from stt_engine import STTEngine
from history_db import HistoryDB

app = Flask(
    __name__,
    template_folder='../frontend',
    static_folder='../frontend',
    static_url_path=''
)
CORS(app)

# Configuration
app.config.update(
    SECRET_KEY=os.environ.get('SECRET_KEY', 'your-secret-key-here'),
    UPLOAD_FOLDER='static/voice',
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB
    ALLOWED_AUDIO_EXTENSIONS={'wav', 'mp3', 'm4a', 'flac'}
)

# Component Initialization
calculator = Calculator()
tts_engine = TTSEngine()
stt_engine = STTEngine()
history_db = HistoryDB()

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('history', exist_ok=True)

# Helpers
def allowed_audio_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_AUDIO_EXTENSIONS']

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        expression = data.get('expression', '').strip()
        if not expression:
            return jsonify({'error': 'Expression is required'}), 400

        result = calculator.evaluate(expression)
        history_id = history_db.add_calculation(
            expression, result,
            session_id=request.headers.get('X-Session-ID'),
            user_agent=request.headers.get('User-Agent'),
            ip_address=request.remote_addr
        )

        audio_filename = None
        if data.get('generate_audio'):
            audio_text = f"The result is {result}"
            audio_filename = tts_engine.generate_speech(audio_text, f"result_{history_id}")

        return jsonify({
            'result': result,
            'expression': expression,
            'audio_url': f'/api/audio/{audio_filename}' if audio_filename else None,
            'history_id': history_id,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in calculate: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/voice-to-text', methods=['POST'])
def voice_to_text():
    try:
        audio = request.files.get('audio')
        if not audio or not allowed_audio_file(audio.filename):
            return jsonify({'error': 'Invalid or missing audio file'}), 400

        filename = f"temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.wav"
        path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio.save(path)

        try:
            text = stt_engine.transcribe_audio(path)
            expression = calculator.parse_voice_input(text)
            return jsonify({
                'transcribed_text': text,
                'expression': expression,
                'timestamp': datetime.now().isoformat()
            })
        finally:
            os.remove(path)
    except Exception as e:
        logger.error(f"Voice to text error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to process audio'}), 500

@app.route('/api/text-to-speech', methods=['POST'])
def text_to_speech():
    try:
        text = request.get_json().get('text', '').strip()
        if not text:
            return jsonify({'error': 'Text is required'}), 400

        filename = f"tts_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        audio_filename = tts_engine.generate_speech(text, filename)

        return jsonify({
            'audio_url': f'/api/audio/{audio_filename}',
            'filename': audio_filename
        }) if audio_filename else jsonify({'error': 'TTS failed'}), 500
    except Exception as e:
        logger.error(f"Text to speech error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to generate speech'}), 500

@app.route('/api/audio/<filename>')
def serve_audio(filename):
    try:
        if not allowed_audio_file(filename):
            return jsonify({'error': 'Invalid file format'}), 400

        path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        return send_file(path, mimetype='audio/mpeg') if os.path.exists(path) else jsonify({'error': 'File not found'}), 404
    except Exception as e:
        logger.error(f"Serve audio error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to serve audio'}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)
        session_id = request.headers.get('X-Session-ID')

        history = history_db.get_history(page=page, limit=limit, session_id=session_id)
        total = history_db.get_history_count(session_id=session_id)

        return jsonify({
            'history': history,
            'total': total,
            'page': page,
            'limit': limit,
            'has_more': (page * limit) < total
        })
    except Exception as e:
        logger.error(f"Get history error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to retrieve history'}), 500

@app.route('/api/history/<int:history_id>', methods=['DELETE'])
def delete_history_item(history_id):
    try:
        return jsonify({'message': 'Deleted'}) if history_db.delete_calculation(history_id) else jsonify({'error': 'Not found'}), 404
    except Exception as e:
        logger.error(f"Delete history error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to delete item'}), 500

@app.route('/api/history', methods=['DELETE'])
def clear_history():
    try:
        session_id = request.headers.get('X-Session-ID')
        history_db.clear_history(session_id=session_id)
        return jsonify({'message': 'History cleared'})
    except Exception as e:
        logger.error(f"Clear history error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to clear history'}), 500

@app.route('/api/export-history')
def export_history():
    try:
        session_id = request.headers.get('X-Session-ID')
        data = history_db.get_all_history(session_id=session_id)
        filename = f"calculator_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        path = os.path.join('history', filename)

        with open(path, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        return send_file(path, as_attachment=True, download_name=filename)
    except Exception as e:
        logger.error(f"Export history error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': 'Failed to export history'}), 500

@app.route('/api/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'services': {
            'calculator': True,
            'tts': tts_engine.is_available(),
            'stt': stt_engine.is_available(),
            'database': history_db.is_connected()
        }
    })

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    try:
        history_db.init_db()
        app.run(host='0.0.0.0', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Startup error: {str(e)}\n{traceback.format_exc()}")