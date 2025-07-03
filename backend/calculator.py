import re
import math
import operator
from typing import Union, Dict, Any
import logging

logger = logging.getLogger(__name__)

class Calculator:
    """Mathematical expression evaluator with voice input support"""
    
    def __init__(self):
        # Supported operators
        self.operators = {
            '+': operator.add,
            '-': operator.sub,
            '*': operator.mul,
            '×': operator.mul,
            '/': operator.truediv,
            '÷': operator.truediv,
            '^': operator.pow,
            '**': operator.pow,
            '%': operator.mod
        }
        
        # Mathematical functions - Create a safe namespace
        self.safe_dict = {
            '__builtins__': {},
            'sin': math.sin,
            'cos': math.cos,
            'tan': math.tan,
            'sqrt': math.sqrt,
            'log': math.log10,
            'ln': math.log,
            'abs': abs,
            'round': round,
            'floor': math.floor,
            'ceil': math.ceil,
            'pow': pow,
            'min': min,
            'max': max
        }
        
        # Constants
        self.constants = {
            'pi': math.pi,
            'π': math.pi,
            'e': math.e
        }
        
        # Voice input patterns
        self.voice_patterns = {
            r'\bplus\b|\band\b': '+',
            r'\bminus\b|\bsubtract\b': '-',
            r'\btimes\b|\bmultiplied by\b|\binto\b': '*',
            r'\bdivided by\b|\bover\b': '/',
            r'\bpower of\b|\bto the power of\b|\braised to\b': '**',
            r'\bsquare root of\b|\broot\b': 'sqrt(',
            r'\bsquare\b': '**2',
            r'\bcube\b': '**3',
            r'\bpercent\b|\b%\b': '/100',
            r'\bequals\b|\bis\b|\bcalculate\b': '=',
            r'\bdecimal\b|\bpoint\b': '.',
            r'\bzero\b': '0',
            r'\bone\b': '1',
            r'\btwo\b': '2',
            r'\bthree\b': '3',
            r'\bfour\b': '4',
            r'\bfive\b': '5',
            r'\bsix\b': '6',
            r'\bseven\b': '7',
            r'\beight\b': '8',
            r'\bnine\b': '9',
            r'\bten\b': '10',
            r'\beleven\b': '11',
            r'\btwelve\b': '12',
            r'\bthirteen\b': '13',
            r'\bfourteen\b': '14',
            r'\bfifteen\b': '15',
            r'\bsixteen\b': '16',
            r'\bseventeen\b': '17',
            r'\beighteen\b': '18',
            r'\bnineteen\b': '19',
            r'\btwenty\b': '20',
            r'\bthirty\b': '30',
            r'\bforty\b': '40',
            r'\bfifty\b': '50',
            r'\bsixty\b': '60',
            r'\bseventy\b': '70',
            r'\beighty\b': '80',
            r'\bninety\b': '90',
            r'\bhundred\b': '100',
            r'\bthousand\b': '1000'
        }
        
    def evaluate(self, expression: str) -> Union[float, int]:
        """
        Safely evaluate a mathematical expression
        
        Args:
            expression: Mathematical expression as string
            
        Returns:
            Result of the calculation
            
        Raises:
            ValueError: If expression is invalid
        """
        try:
            # Clean and validate expression
            expression = self._clean_expression(expression)
            
            if not expression:
                raise ValueError("Empty expression")
            
            # Replace constants first
            for constant, value in self.constants.items():
                expression = expression.replace(constant, str(value))
            
            # Handle functions
            expression = self._handle_functions(expression)
            
            # Fix parentheses matching
            expression = self._fix_parentheses(expression)
            
            # Validate expression safety
            if not self._is_safe_expression(expression):
                raise ValueError("Invalid or unsafe expression")
            
            # Evaluate the expression using safe namespace
            result = eval(expression, self.safe_dict)
            
            # Handle special cases
            if isinstance(result, complex):
                if result.imag == 0:
                    result = result.real
                else:
                    raise ValueError("Complex numbers not supported")
            
            # Check for infinity or NaN
            if math.isinf(result):
                raise ValueError("Result is infinity")
            if math.isnan(result):
                raise ValueError("Result is not a number")
            
            # Round very small numbers to zero
            if abs(result) < 1e-10:
                result = 0
            
            # Return integer if possible
            if isinstance(result, float) and result.is_integer():
                return int(result)
            
            return result
            
        except ZeroDivisionError:
            raise ValueError("Division by zero")
        except OverflowError:
            raise ValueError("Number too large")
        except SyntaxError as e:
            raise ValueError(f"Invalid expression syntax: {str(e)}")
        except Exception as e:
            logger.error(f"Calculation error: {str(e)}")
            raise ValueError(f"Calculation error: {str(e)}")
    
    def _clean_expression(self, expression: str) -> str:
        """Clean and normalize the expression"""
        if not expression:
            return ""
        
        # Convert to string if not already
        expression = str(expression).strip()
        
        # Remove extra whitespace but keep single spaces for now
        expression = re.sub(r'\s+', ' ', expression)
        
        # Replace common symbols before removing spaces
        replacements = {
            '×': '*',
            '÷': '/',
            # Don't replace ** with ^ here, we want to keep **
        }
        
        for old, new in replacements.items():
            expression = expression.replace(old, new)
        
        # Handle ^ to ** conversion (but be careful with existing **)
        # Only replace ^ that isn't already part of **
        expression = re.sub(r'(?<!\*)\^(?!\*)', '**', expression)
        
        # Now remove all spaces
        expression = expression.replace(' ', '')
        
        # Handle implicit multiplication (e.g., 2(3+4) -> 2*(3+4))
        expression = re.sub(r'(\d)(\()', r'\1*\2', expression)
        expression = re.sub(r'(\))(\d)', r'\1*\2', expression)
        expression = re.sub(r'(\))(\()', r'\1*\2', expression)
        
        return expression
    
    def _handle_functions(self, expression: str) -> str:
        """Process mathematical functions in the expression"""
        # Add missing multiplication signs before functions
        for func in self.safe_dict.keys():
            if func != '__builtins__' and callable(self.safe_dict[func]):
                # Add * before function if preceded by number or )
                pattern = f"([0-9)])({func})"
                expression = re.sub(pattern, r'\1*\2', expression)
        
        return expression
    
    def _fix_parentheses(self, expression: str) -> str:
        """Ensure parentheses are properly matched"""
        open_count = expression.count('(')
        close_count = expression.count(')')
        
        # Add missing closing parentheses
        if open_count > close_count:
            expression += ')' * (open_count - close_count)
        
        return expression
    
    def _is_safe_expression(self, expression: str) -> bool:
        """Check if expression contains only safe characters and functions"""
        # Allowed characters: numbers, operators, parentheses, functions, constants, decimal points
        allowed_pattern = r'^[0-9+\-*/().a-zA-Z_\s]*$'
        
        if not re.match(allowed_pattern, expression):
            return False
        
        # Check for dangerous patterns
        dangerous_patterns = [
            r'__',  # Double underscore (Python internals)
            r'import',
            r'exec',
            r'eval',
            r'open',
            r'file',
            r'input',
            r'raw_input',
            r'globals',
            r'locals',
            r'vars',
            r'dir',
            r'help'
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, expression, re.IGNORECASE):
                return False
        
        return True
    
    def parse_voice_input(self, voice_text: str) -> str:
        """
        Convert voice input to mathematical expression
        
        Args:
            voice_text: Transcribed voice input
            
        Returns:
            Mathematical expression string
        """
        if not voice_text:
            return ""
        
        # Convert to lowercase for processing
        text = voice_text.lower().strip()
        
        # Remove common filler words
        filler_words = ['um', 'uh', 'please', 'can you', 'what is', 'calculate']
        for word in filler_words:
            text = re.sub(rf'\b{word}\b', '', text)
        
        # Apply voice patterns
        for pattern, replacement in self.voice_patterns.items():
            text = re.sub(pattern, replacement, text)
        
        # Handle special cases
        text = self._handle_voice_special_cases(text)
        
        # Clean up the result
        text = re.sub(r'\s+', '', text)  # Remove extra spaces
        text = re.sub(r'=+', '', text)   # Remove equals signs
        
        return text
    
    def _handle_voice_special_cases(self, text: str) -> str:
        """Handle special voice input cases"""
        # Handle compound numbers (twenty-one, thirty-five, etc.)
        compound_patterns = {
            r'twenty[- ]one': '21',
            r'twenty[- ]two': '22',
            r'twenty[- ]three': '23',
            r'twenty[- ]four': '24',
            r'twenty[- ]five': '25',
            r'twenty[- ]six': '26',
            r'twenty[- ]seven': '27',
            r'twenty[- ]eight': '28',
            r'twenty[- ]nine': '29',
            r'thirty[- ]one': '31',
            r'thirty[- ]two': '32',
            r'thirty[- ]three': '33',
            r'thirty[- ]four': '34',
            r'thirty[- ]five': '35',
            r'thirty[- ]six': '36',
            r'thirty[- ]seven': '37',
            r'thirty[- ]eight': '38',
            r'thirty[- ]nine': '39',
        }
        
        for pattern, replacement in compound_patterns.items():
            text = re.sub(pattern, replacement, text)
        
        # Handle fractions
        fraction_patterns = {
            r'one half': '0.5',
            r'half': '0.5',
            r'quarter': '0.25',
            r'three quarters': '0.75'
        }
        
        for pattern, replacement in fraction_patterns.items():
            text = re.sub(pattern, replacement, text)
        
        return text
    
    def get_functions_list(self) -> Dict[str, Any]:
        """Return available functions and their descriptions"""
        return {
            'sin': 'Sine function (radians)',
            'cos': 'Cosine function (radians)',
            'tan': 'Tangent function (radians)',
            'sqrt': 'Square root',
            'log': 'Base-10 logarithm',
            'ln': 'Natural logarithm',
            'abs': 'Absolute value',
            'round': 'Round to nearest integer',
            'floor': 'Round down to integer',
            'ceil': 'Round up to integer'
        }
    
    def get_constants_list(self) -> Dict[str, float]:
        """Return available constants"""
        return self.constants.copy()


# Test the calculator
if __name__ == "__main__":
    calc = Calculator()
    
    # Test cases
    test_expressions = [
        "2+3*4",
        "sqrt(16)",
        "sin(pi/2)",
        "2^3",
        "2**3",
        "(2+3)*4",
        "10/2",
        "abs(-5)",
        "round(3.7)",
        "2*pi",
        "e^2"
    ]
    
    print("Testing Calculator:")
    print("-" * 40)
    
    for expr in test_expressions:
        try:
            result = calc.evaluate(expr)
            print(f"{expr} = {result}")
        except ValueError as e:
            print(f"{expr} -> Error: {e}")
        except Exception as e:
            print(f"{expr} -> Unexpected error: {e}")