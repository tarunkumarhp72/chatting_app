"""Utility functions for emoji extraction and detection."""
import re
from typing import List, Optional, Tuple

# Comprehensive emoji regex pattern
# This pattern matches most Unicode emoji ranges
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # flags (iOS)
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed characters
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols and pictographs extended-A
    "\U00002600-\U000026FF"  # miscellaneous symbols
    "\U00002700-\U000027BF"  # dingbats
    "\U0001F018-\U0001F270"  # various asian characters
    "\U0001F300-\U0001F5FF"  # miscellaneous symbols and pictographs
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F680-\U0001F6FF"  # transport and map symbols
    "\U0001F700-\U0001F77F"  # alchemical symbols
    "\U0001F780-\U0001F7FF"  # geometric shapes extended
    "\U0001F800-\U0001F8FF"  # supplemental arrows-C
    "\U0001F900-\U0001F9FF"  # supplemental symbols and pictographs
    "\U0001FA00-\U0001FA6F"  # chess symbols
    "\U0001FA70-\U0001FAFF"  # symbols and pictographs extended-A
    "\U00002600-\U000026FF"  # miscellaneous symbols
    "\U00002700-\U000027BF"  # dingbats
    "]+"
)


def extract_emojis(text: str) -> List[str]:
    """
    Extract all emojis from a text string.
    
    Args:
        text: Input text string
        
    Returns:
        List of emoji characters found in the text
    """
    if not text:
        return []
    
    # Find all emoji matches
    emojis = EMOJI_PATTERN.findall(text)
    # Flatten the list (each match might be a string with multiple emojis)
    result = []
    for emoji_match in emojis:
        # Split combined emojis (e.g., 👨‍👩‍👧‍👦 can be multiple)
        # For simplicity, we'll treat each match as one emoji
        result.extend(list(emoji_match))
    
    return result


def get_emojis_string(text: str) -> Optional[str]:
    """
    Extract emojis from text and return as a single string.
    If multiple emojis found, return them concatenated.
    
    Args:
        text: Input text string
        
    Returns:
        String containing all emojis found, or None if no emojis
    """
    emojis = extract_emojis(text)
    if not emojis:
        return None
    
    # Return as concatenated string
    return "".join(emojis)


def contains_only_emojis(text: str) -> bool:
    """
    Check if text contains only emojis (and whitespace).
    
    Args:
        text: Input text string
        
    Returns:
        True if text contains only emojis and optional whitespace
    """
    if not text:
        return False
    
    # Remove all emojis from text
    text_without_emojis = EMOJI_PATTERN.sub('', text)
    # Remove whitespace
    text_without_emojis = text_without_emojis.strip()
    
    # If nothing left, it was only emojis (and maybe whitespace)
    return len(text_without_emojis) == 0


def split_text_and_emojis(text: str) -> Tuple[str, Optional[str]]:
    """
    Split text into regular text and emojis.
    
    Args:
        text: Input text string
        
    Returns:
        Tuple of (text_without_emojis, emojis_string)
    """
    if not text:
        return "", None
    
    # Extract emojis
    emojis = extract_emojis(text)
    emojis_string = "".join(emojis) if emojis else None
    
    # Remove emojis from text
    text_without_emojis = EMOJI_PATTERN.sub('', text).strip()
    
    return text_without_emojis, emojis_string

