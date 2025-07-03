import os
import logging
from typing import Optional
import tempfile

try:
    import speech_recognition as sr
    STT_AVAILABLE = True
except ImportError:
    STT_AVAILABLE = False

try:
    import wave
    import audioop
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False

logger = logging.getLogger(__name__)

class STTEngine:
    """Speech-to-Text engine with multiple backend support"""
    
    def __init__(self):
        self.recognizer = None
        self.backend = None
        
        # Initialize STT engine
        self._initialize_engine()
    
    def _initialize_engine(self):
        """Initialize the best available STT engine"""
        if STT_AVAILABLE:
            try:
                self.recognizer = sr.Recognizer()
                self.backend = "speech_recognition"
                
                # Configure recognizer settings
                self.recognizer.energy_threshold = 300
                self.recognizer.dynamic_energy_threshold = True
                self.recognizer.pause_threshold = 0.8
                self.recognizer.phrase_threshold = 0.3
                
                logger.info("Initialized speech_recognition STT engine")
                return
                
            except Exception as e:
                logger.warning(f"Failed to initialize speech_recognition: {e}")
        
        logger.warning("No STT engine available")
        self.backend = None
    
    def is_available(self) -> bool:
        """Check if STT is available"""
        return self.backend is not None
    
    def transcribe_audio(self, audio_file_path: str, language: str = "en-US") -> Optional[str]:
        """
        Transcribe audio file to text
        
        Args:
            audio_file_path: Path to audio file
            language: Language code for recognition
            
        Returns:
            Transcribed text or None if failed
        """
        if not self.is_available():
            logger.error("No STT engine available")
            return None
        
        if not os.path.exists(audio_file_path):
            logger.error(f"Audio file not found: {audio_file_path}")
            return None
        
        try:
            # Process audio file
            processed_audio = self._process_audio_file(audio_file_path)
            if not processed_audio:
                return None
            
            # Perform speech recognition
            return self._recognize_speech(processed_audio, language)
            
        except Exception as e:
            logger.error(f"STT transcription error: {e}")
            return None
    
    def transcribe_audio_data(self, audio_data: bytes, language: str = "en-US") -> Optional[str]:
        """
        Transcribe raw audio data to text
        
        Args:
            audio_data: Raw audio bytes
            language: Language code for recognition
            
        Returns:
            Transcribed text or None if failed
        """
        if not self.is_available():
            logger.error("No STT engine available")
            return None
        
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            try:
                # Transcribe the temporary file
                result = self.transcribe_audio(temp_path, language)
                return result
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
        except Exception as e:
            logger.error(f"STT transcription error: {e}")
            return None
    
    def _process_audio_file(self, audio_file_path: str) -> Optional[sr.AudioData]:
        """Process audio file and return AudioData object"""
        try:
            # Determine file type and process accordingly
            file_extension = os.path.splitext(audio_file_path)[1].lower()
            
            if file_extension in ['.wav', '.wave']:
                return self._process_wav_file(audio_file_path)
            elif file_extension in ['.mp3', '.m4a', '.flac']:
                # Convert to WAV first (requires ffmpeg or similar)
                return self._convert_and_process_audio(audio_file_path)
            else:
                logger.error(f"Unsupported audio format: {file_extension}")
                return None
                
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            return None
    
    def _process_wav_file(self, wav_file_path: str) -> Optional[sr.AudioData]:
        """Process WAV file"""
        try:
            with sr.AudioFile(wav_file_path) as source:
                # Adjust for ambient noise
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                # Record the audio data
                audio_data = self.recognizer.record(source)
                return audio_data
                
        except Exception as e:
            logger.error(f"WAV processing error: {e}")
            return None
    
    def _convert_and_process_audio(self, audio_file_path: str) -> Optional[sr.AudioData]:
        """Convert non-WAV audio to WAV and process"""
        try:
            # This would require ffmpeg or similar audio conversion tool
            # For now, we'll log an error and return None
            logger.error("Audio conversion not implemented - requires ffmpeg")
            return None
            
        except Exception as e:
            logger.error(f"Audio conversion error: {e}")
            return None
    
    def _recognize_speech(self, audio_data: sr.AudioData, language: str) -> Optional[str]:
        """Perform speech recognition on audio data"""
        try:
            # Try Google Speech Recognition (free tier)
            try:
                text = self.recognizer.recognize_google(audio_data, language=language)
                logger.info(f"Speech recognized: {text}")
                return text.strip()
            except sr.RequestError as e:
                logger.error(f"Google Speech Recognition request error: {e}")
            except sr.UnknownValueError:
                logger.warning("Google Speech Recognition could not understand the audio")
            
            # Fallback to offline recognition if available
            try:
                text = self.recognizer.recognize_sphinx(audio_data)
                logger.info(f"Speech recognized (offline): {text}")
                return text.strip()
            except sr.RequestError as e:
                logger.error(f"Sphinx recognition error: {e}")
            except sr.UnknownValueError:
                logger.warning("Sphinx could not understand the audio")
            except AttributeError:
                logger.info("Sphinx not available")
            
            return None
            
        except Exception as e:
            logger.error(f"Speech recognition error: {e}")
            return None
    
    def listen_from_microphone(self, timeout: int = 5, phrase_time_limit: int = 10) -> Optional[str]:
        """
        Listen to microphone and transcribe speech
        
        Args:
            timeout: Seconds to wait for speech to start
            phrase_time_limit: Maximum seconds for a phrase
            
        Returns:
            Transcribed text or None if failed
        """
        if not self.is_available():
            logger.error("No STT engine available")
            return None
        
        try:
            with sr.Microphone() as source:
                logger.info("Listening...")
                # Adjust for ambient noise
                self.recognizer.adjust_for_ambient_noise(source, duration=1)
                # Listen for audio
                audio_data = self.recognizer.listen(
                    source, 
                    timeout=timeout, 
                    phrase_time_limit=phrase_time_limit
                )
                
                # Recognize speech
                return self._recognize_speech(audio_data, "en-US")
                
        except sr.WaitTimeoutError:
            logger.warning("Listening timeout - no speech detected")
            return None
        except Exception as e:
            logger.error(f"Microphone listening error: {e}")
            return None
    
    def get_available_languages(self) -> list:
        """Get list of supported languages"""
        return [
            {"code": "en-US", "name": "English (US)"},
            {"code": "en-GB", "name": "English (UK)"},
            {"code": "es-ES", "name": "Spanish (Spain)"},
            {"code": "es-MX", "name": "Spanish (Mexico)"},
            {"code": "fr-FR", "name": "French (France)"},
            {"code": "de-DE", "name": "German (Germany)"},
            {"code": "it-IT", "name": "Italian (Italy)"},
            {"code": "pt-BR", "name": "Portuguese (Brazil)"},
            {"code": "ja-JP", "name": "Japanese (Japan)"},
            {"code": "ko-KR", "name": "Korean (South Korea)"},
            {"code": "zh-CN", "name": "Chinese (Simplified)"},
            {"code": "hi-IN", "name": "Hindi (India)"}
        ]