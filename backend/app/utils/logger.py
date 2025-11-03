"""Safe logging utility that handles Unicode/emoji characters."""
import sys
import io
from typing import Any

# Configure stdout/stderr for UTF-8 on Windows
if sys.platform == 'win32':
    try:
        # Try to set UTF-8 encoding for console output
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

def safe_print(*args, **kwargs):
    """
    Safe print function that handles Unicode characters including emojis.
    Encodes output as UTF-8 to avoid Windows charmap codec errors.
    """
    try:
        # Try normal print first
        print(*args, **kwargs)
    except (UnicodeEncodeError, UnicodeDecodeError) as e:
        # Fallback: sanitize strings to avoid encoding errors
        safe_args = []
        for arg in args:
            if isinstance(arg, str):
                # Replace problematic Unicode characters
                safe_arg = arg.encode('ascii', errors='replace').decode('ascii')
                safe_args.append(safe_arg)
            elif isinstance(arg, dict):
                # Handle dictionaries that might contain emoji strings
                safe_dict = {}
                for k, v in arg.items():
                    safe_key = str(k).encode('ascii', errors='replace').decode('ascii') if isinstance(k, str) else k
                    if isinstance(v, str):
                        safe_val = v.encode('ascii', errors='replace').decode('ascii')
                    else:
                        safe_val = v
                    safe_dict[safe_key] = safe_val
                safe_args.append(safe_dict)
            else:
                try:
                    safe_args.append(str(arg))
                except:
                    safe_args.append('<Unable to convert>')
        try:
            print(*safe_args, **kwargs)
        except:
            # Final fallback - just print error message
            print(f"[Print error: unable to display message with Unicode characters]", **kwargs)


def safe_repr(obj: Any) -> str:
    """
    Safe representation function that handles Unicode characters.
    """
    try:
        return repr(obj)
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Fallback: convert to string and handle encoding errors
        try:
            return str(obj).encode('ascii', errors='replace').decode('ascii')
        except:
            return "<Unable to represent object>"

