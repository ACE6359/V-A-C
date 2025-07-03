import os
import logging
from typing import Optional
import hashlib
import time

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False

logger = logging.getLogger(__name__)

class TTSEngine:
    """Text-to-Speech engine with multiple backend support"""
    
    def __init__(self, output_dir: str = "static/voice"):
        self.output_dir = output_dir
        self.engine = None
        self.backend = None
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Initialize TTS engine
        self._initialize_engine()
    
    def _initialize_engine(self):
        """Initialize the best available TTS engine"""
        if TTS_AVAILABLE:
            try:
                self.engine = pyttsx3.init()
                self.backend = "pyttsx3"
                
                # Configure voice settings
                voices = self.engine.getProperty('voices')
                if voices:
                    # Try to use a female voice if available
                    for voice in voices:
                        if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                            self.engine.setProperty('voice', voice.id)
                            break
                
                # Set speech rate and volume
                self.engine.setProperty('rate', 150)  # Speed of speech
                self.engine.setProperty('volume', 0.8)  # Volume level (0.0 to 1.0)
                
                logger.info("Initialized pyttsx3 TTS engine")
                return
                
            except Exception as e:
                logger.warning(f"Failed to initialize pyttsx3: {e}")
        
        if GTTS_AVAILABLE:
            self.backend = "gtts"
            logger.info("Using Google TTS (gTTS) engine")
            return
        
        logger.warning("No TTS engine available")
        self.backend = None
    
    def is_available(self) -> bool:
        """Check if TTS is available"""
        return self.backend is not None
    
    def generate_speech(self, text: str, filename: str = None) -> Optional[str]:
        """
        Generate speech audio from text
        
        Args:
            text: Text to convert to speech
            filename: Output filename (without extension)
            
        Returns:
            Generated audio filename or None if failed
        """
        if not self.is_available():
            logger.error("No TTS engine available")
            return None
        
        if not text.strip():
            logger.error("Empty text provided")
            return None
        
        try:
            # Generate filename if not provided
            if not filename:
                text_hash = hashlib.md5(text.encode()).hexdigest()[:8]
                filename = f"tts_{int(time.time())}_{text_hash}"
            
            output_file = f"{filename}.mp3"
            output_path = os.path.join(self.output_dir, output_file)
            
            if self.backend == "pyttsx3":
                return self._generate_with_pyttsx3(text, output_path, output_file)
            elif self.backend == "gtts":
                return self._generate_with_gtts(text, output_path, output_file)
            
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            return None
    
    def _generate_with_pyttsx3(self, text: str, output_path: str, output_file: str) -> Optional[str]:
        """Generate speech using pyttsx3"""
        try:
            # Save to file
            self.engine.save_to_file(text, output_path)
            self.engine.runAndWait()
            
            # Check if file was created
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"Generated TTS audio: {output_file}")
                return output_file
            else:
                logger.error("pyttsx3 failed to generate audio file")
                return None
                
        except Exception as e:
            logger.error(f"pyttsx3 generation error: {e}")
            return None
    
    def _generate_with_gtts(self, text: str, output_path: str, output_file: str) -> Optional[str]:
        """Generate speech using Google TTS"""
        try:
            # Create gTTS object
            tts = gTTS(text=text, lang='en', slow=False)
            
            # Save to file
            tts.save(output_path)
            
            # Check if file was created
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                logger.info(f"Generated TTS audio: {output_file}")
                return output_file
            else:
                logger.error("gTTS failed to generate audio file")
                return None
                
        except Exception as e:
            logger.error(f"gTTS generation error: {e}")
            return None
    
    def get_voices(self) -> list:
        """Get available voices"""
        if self.backend == "pyttsx3" and self.engine:
            try:
                voices = self.engine.getProperty('voices')
                return [
                    {
                        'id': voice.id,
                        'name': voice.name,
                        'gender': 'female' if 'female' in voice.name.lower() else 'male'
                    }
                    for voice in voices
                ] if voices else []
            except:
                return []
        
        return []
    
    def set_voice(self, voice_id: str) -> bool:
        """Set the TTS voice"""
        if self.backend == "pyttsx3" and self.engine:
            try:
                self.engine.setProperty('voice', voice_id)
                return True
            except:
                return False
        return False
    
    def set_rate(self, rate: int) -> bool:
        """Set speech rate (words per minute)"""
        if self.backend == "pyttsx3" and self.engine:
            try:
                self.engine.setProperty('rate', max(50, min(300, rate)))
                return True
            except:
                return False
        return False
    
    def set_volume(self, volume: float) -> bool:
        """Set volume (0.0 to 1.0)"""
        if self.backend == "pyttsx3" and self.engine:
            try:
                self.engine.setProperty('volume', max(0.0, min(1.0, volume)))
                return True
            except:
                return False
        return False
    
    def cleanup_old_files(self, max_age_hours: int = 24):
        """Clean up old TTS files"""
        try:
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            for filename in os.listdir(self.output_dir):
                if filename.endswith('.mp3'):
                    file_path = os.path.join(self.output_dir, filename)
                    file_age = current_time - os.path.getctime(file_path)
                    
                    if file_age > max_age_seconds:
                        os.remove(file_path)
                        logger.info(f"Cleaned up old TTS file: {filename}")
                        
        except Exception as e:
            logger.error(f"TTS cleanup error: {e}")