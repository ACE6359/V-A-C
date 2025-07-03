import sqlite3
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
import json
import os
import threading

logger = logging.getLogger(__name__)

class HistoryDB:
    """Database manager for calculation history"""
    
    def __init__(self, db_path: str = "calculator_history.db"):
        self.db_path = db_path
        self.connection = None
        self.lock = threading.Lock()
        
        # Initialize database
        self.init_db()
    
    def init_db(self):
        """Initialize the database and create tables"""
        try:
            with self.lock:
                self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
                self.connection.row_factory = sqlite3.Row
                
                # Create tables
                self._create_tables()
                
                logger.info(f"Database initialized: {self.db_path}")
                
        except Exception as e:
            logger.error(f"Database initialization error: {e}")
            raise
    
    def _create_tables(self):
        """Create database tables"""
        cursor = self.connection.cursor()
        
        # Calculations table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS calculations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expression TEXT NOT NULL,
                result TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                voice_input TEXT,
                session_id TEXT,
                user_agent TEXT,
                ip_address TEXT,
                error_message TEXT,
                execution_time REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Sessions table for tracking user sessions
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                calculation_count INTEGER DEFAULT 0,
                user_agent TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Settings table for user preferences
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                session_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes for better performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_calculations_timestamp ON calculations(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_calculations_session ON calculations(session_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)')
        
        self.connection.commit()
    
    def is_connected(self) -> bool:
        """Check if database connection is active"""
        try:
            if self.connection:
                self.connection.execute('SELECT 1')
                return True
        except:
            pass
        return False
    
    def add_calculation(self, expression: str, result: Any, 
                       voice_input: Optional[str] = None,
                       session_id: Optional[str] = None,
                       user_agent: Optional[str] = None,
                       ip_address: Optional[str] = None,
                       execution_time: Optional[float] = None) -> int:
        """
        Add a calculation to history
        
        Args:
            expression: Mathematical expression
            result: Calculation result
            voice_input: Original voice input (if any)
            session_id: Session identifier
            user_agent: User agent string
            ip_address: Client IP address
            execution_time: Time taken to execute (seconds)
            
        Returns:
            ID of the inserted record
        """
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                cursor.execute('''
                    INSERT INTO calculations (
                        expression, result, voice_input, session_id, 
                        user_agent, ip_address, execution_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    expression,
                    str(result),
                    voice_input,
                    session_id,
                    user_agent,
                    ip_address,
                    execution_time
                ))
                
                calculation_id = cursor.lastrowid
                self.connection.commit()
                
                # Update session calculation count
                if session_id:
                    self._update_session_count(session_id)
                
                logger.info(f"Added calculation to history: ID {calculation_id}")
                return calculation_id
                
        except Exception as e:
            logger.error(f"Error adding calculation to history: {e}")
            if self.connection:
                self.connection.rollback()
            raise
    
    def get_history(self, page: int = 1, limit: int = 50, 
                   session_id: Optional[str] = None) -> List[Dict]:
        """
        Get calculation history with pagination
        
        Args:
            page: Page number (1-based)
            limit: Number of records per page
            session_id: Filter by session ID
            
        Returns:
            List of calculation records
        """
        try:
            with self.lock:
                cursor = self.connection.cursor()
                offset = (page - 1) * limit
                
                if session_id:
                    cursor.execute('''
                        SELECT * FROM calculations 
                        WHERE session_id = ?
                        ORDER BY timestamp DESC 
                        LIMIT ? OFFSET ?
                    ''', (session_id, limit, offset))
                else:
                    cursor.execute('''
                        SELECT * FROM calculations 
                        ORDER BY timestamp DESC 
                        LIMIT ? OFFSET ?
                    ''', (limit, offset))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error retrieving history: {e}")
            return []
    
    def get_history_count(self, session_id: Optional[str] = None) -> int:
        """Get total number of calculations in history"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                if session_id:
                    cursor.execute('SELECT COUNT(*) FROM calculations WHERE session_id = ?', (session_id,))
                else:
                    cursor.execute('SELECT COUNT(*) FROM calculations')
                
                return cursor.fetchone()[0]
                
        except Exception as e:
            logger.error(f"Error getting history count: {e}")
            return 0
    
    def get_calculation(self, calculation_id: int) -> Optional[Dict]:
        """Get a specific calculation by ID"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                cursor.execute('SELECT * FROM calculations WHERE id = ?', (calculation_id,))
                
                row = cursor.fetchone()
                return dict(row) if row else None
                
        except Exception as e:
            logger.error(f"Error retrieving calculation {calculation_id}: {e}")
            return None
    
    def delete_calculation(self, calculation_id: int) -> bool:
        """Delete a specific calculation"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                cursor.execute('DELETE FROM calculations WHERE id = ?', (calculation_id,))
                
                deleted = cursor.rowcount > 0
                self.connection.commit()
                
                if deleted:
                    logger.info(f"Deleted calculation ID {calculation_id}")
                
                return deleted
                
        except Exception as e:
            logger.error(f"Error deleting calculation {calculation_id}: {e}")
            if self.connection:
                self.connection.rollback()
            return False
    
    def clear_history(self, session_id: Optional[str] = None):
        """Clear calculation history"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                if session_id:
                    cursor.execute('DELETE FROM calculations WHERE session_id = ?', (session_id,))
                    logger.info(f"Cleared history for session {session_id}")
                else:
                    cursor.execute('DELETE FROM calculations')
                    logger.info("Cleared all calculation history")
                
                self.connection.commit()
                
        except Exception as e:
            logger.error(f"Error clearing history: {e}")
            if self.connection:
                self.connection.rollback()
            raise
    
    def get_all_history(self) -> List[Dict]:
        """Get all calculation history (for export)"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                cursor.execute('SELECT * FROM calculations ORDER BY timestamp DESC')
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Error retrieving all history: {e}")
            return []
    
    def create_session(self, session_id: str, user_agent: Optional[str] = None,
                      ip_address: Optional[str] = None) -> bool:
        """Create a new session"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                cursor.execute('''
                    INSERT OR REPLACE INTO sessions (session_id, user_agent, ip_address)
                    VALUES (?, ?, ?)
                ''', (session_id, user_agent, ip_address))
                
                self.connection.commit()
                logger.info(f"Created session: {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            if self.connection:
                self.connection.rollback()
            return False
    
    def _update_session_count(self, session_id: str):
        """Update calculation count for a session"""
        try:
            cursor = self.connection.cursor()
            cursor.execute('''
                UPDATE sessions 
                SET calculation_count = calculation_count + 1,
                    end_time = CURRENT_TIMESTAMP
                WHERE session_id = ?
            ''', (session_id,))
            
        except Exception as e:
            logger.error(f"Error updating session count: {e}")
    
    def get_session_stats(self, session_id: str) -> Optional[Dict]:
        """Get statistics for a session"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                cursor.execute('''
                    SELECT 
                        s.*,
                        COUNT(c.id) as actual_calculation_count,
                        MIN(c.timestamp) as first_calculation,
                        MAX(c.timestamp) as last_calculation
                    FROM sessions s
                    LEFT JOIN calculations c ON s.session_id = c.session_id
                    WHERE s.session_id = ?
                    GROUP BY s.id
                ''', (session_id,))
                
                row = cursor.fetchone()
                return dict(row) if row else None
                
        except Exception as e:
            logger.error(f"Error getting session stats: {e}")
            return None
    
    def get_settings(self, session_id: Optional[str] = None) -> Dict:
        """Get user settings"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                if session_id:
                    cursor.execute('SELECT key, value FROM settings WHERE session_id = ? OR session_id IS NULL', (session_id,))
                else:
                    cursor.execute('SELECT key, value FROM settings WHERE session_id IS NULL')
                
                rows = cursor.fetchall()
                settings = {}
                for row in rows:
                    try:
                        settings[row['key']] = json.loads(row['value'])
                    except json.JSONDecodeError:
                        settings[row['key']] = row['value']
                
                return settings
                
        except Exception as e:
            logger.error(f"Error retrieving settings: {e}")
            return {}
    
    def set_setting(self, key: str, value: Any, session_id: Optional[str] = None) -> bool:
        """Set a user setting"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                # Convert value to JSON string if it's not a string
                if isinstance(value, (dict, list, bool, int, float)):
                    value_str = json.dumps(value)
                else:
                    value_str = str(value)
                
                cursor.execute('''
                    INSERT OR REPLACE INTO settings (key, value, session_id, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ''', (key, value_str, session_id))
                
                self.connection.commit()
                return True
                
        except Exception as e:
            logger.error(f"Error setting {key}: {e}")
            if self.connection:
                self.connection.rollback()
            return False
    
    def get_statistics(self) -> Dict:
        """Get database statistics"""
        try:
            with self.lock:
                cursor = self.connection.cursor()
                
                # Get total calculations
                cursor.execute('SELECT COUNT(*) FROM calculations')
                total_calculations = cursor.fetchone()[0]
                
                # Get calculations today
                cursor.execute('''
                    SELECT COUNT(*) FROM calculations 
                    WHERE DATE(timestamp) = DATE('now')
                ''')
                today_calculations = cursor.fetchone()[0]
                
                # Get total sessions
                cursor.execute('SELECT COUNT(*) FROM sessions')
                total_sessions = cursor.fetchone()[0]
                
                # Get most used expressions
                cursor.execute('''
                    SELECT expression, COUNT(*) as count 
                    FROM calculations 
                    GROUP BY expression 
                    ORDER BY count DESC 
                    LIMIT 10
                ''')
                popular_expressions = [dict(row) for row in cursor.fetchall()]
                
                return {
                    'total_calculations': total_calculations,
                    'today_calculations': today_calculations,
                    'total_sessions': total_sessions,
                    'popular_expressions': popular_expressions,
                    'database_size': os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
                }
                
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return {}
    
    def backup_database(self, backup_path: str) -> bool:
        """Create a backup of the database"""
        try:
            with self.lock:
                # Create backup directory if it doesn't exist
                os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                
                # Copy database file
                import shutil
                shutil.copy2(self.db_path, backup_path)
                
                logger.info(f"Database backed up to: {backup_path}")
                return True
                
        except Exception as e:
            logger.error(f"Error backing up database: {e}")
            return False
    
    def close(self):
        """Close database connection"""
        try:
            if self.connection:
                with self.lock:
                    self.connection.close()
                    self.connection = None
                logger.info("Database connection closed")
        except Exception as e:
            logger.error(f"Error closing database: {e}")