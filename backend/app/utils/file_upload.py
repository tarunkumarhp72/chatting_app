"""File upload utility with organized folder structure."""
import os
import uuid
import shutil
from pathlib import Path
from fastapi import UploadFile
from typing import Tuple, Optional
import base64
from datetime import datetime

# Base uploads directory (relative to backend folder)
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

# Folder structure
PROFILE_IMAGES_DIR = UPLOADS_DIR / "profile_images"
ATTACHMENTS_DIR = UPLOADS_DIR / "attachments"
ATTACHMENT_SUBDIRS = {
    'images': ATTACHMENTS_DIR / 'images',
    'music': ATTACHMENTS_DIR / 'music',
    'files': ATTACHMENTS_DIR / 'files'
}

# File type mappings
FILE_TYPE_MAP = {
    'image': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'],
    'music': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'],
    'file': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', 
             '.txt', '.rtf', '.zip', '.rar', '.7z', '.tar', '.gz']
}

ALLOWED_EXTENSIONS = set()
for extensions in FILE_TYPE_MAP.values():
    ALLOWED_EXTENSIONS.update(extensions)


def initialize_directories():
    """Create all necessary upload directories."""
    PROFILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    for subdir in ATTACHMENT_SUBDIRS.values():
        subdir.mkdir(parents=True, exist_ok=True)


def get_file_category(filename: str) -> str:
    """
    Determine file category based on extension.
    
    Categorization:
    - Images: .jpg, .jpeg, .png, .gif, .webp, .bmp, .svg -> 'images' folder
    - Music: .mp3, .wav, .ogg, .m4a, .flac, .aac, .wma -> 'music' folder
    - Files: All other files (docs, PDFs, etc.) -> 'files' folder
    
    Returns:
        'image' for image files -> saves to uploads/attachments/images/
        'music' for audio files -> saves to uploads/attachments/music/
        'file' for all other files -> saves to uploads/attachments/files/
    """
    ext = Path(filename).suffix.lower()
    
    # Check image extensions first (most common)
    if ext in FILE_TYPE_MAP['image']:
        return 'image'
    
    # Check music/audio extensions
    if ext in FILE_TYPE_MAP['music']:
        return 'music'
    
    # Check document/file extensions
    if ext in FILE_TYPE_MAP['file']:
        return 'file'
    
    # Default to 'file' category for unknown extensions
    return 'file'


def save_upload_file(file: UploadFile, category: str = 'attachment') -> Tuple[Path, str]:
    """
    Save uploaded file to appropriate directory.
    
    Args:
        file: UploadFile object
        category: Either 'profile' for profile images or 'attachment' for attachments
        
    Returns:
        Tuple of (file_path, relative_url)
    """
    initialize_directories()
    
    ext = Path(file.filename).suffix.lower()
    unique_filename = f"{uuid.uuid4()}{ext}"
    
    if category == 'profile':
        # Save to profile_images folder
        file_path = PROFILE_IMAGES_DIR / unique_filename
        relative_url = f"/uploads/profile_images/{unique_filename}"
    else:
        # Determine attachment subfolder based on file type
        file_category = get_file_category(file.filename)
        
        # Map category to folder key (category is singular, folder key is plural)
        folder_map = {
            'image': 'images',    # 'image' category -> 'images' folder
            'music': 'music',     # 'music' category -> 'music' folder  
            'file': 'files'       # 'file' category -> 'files' folder
        }
        folder_key = folder_map.get(file_category, 'files')
        target_dir = ATTACHMENT_SUBDIRS.get(folder_key, ATTACHMENT_SUBDIRS['files'])
        file_path = target_dir / unique_filename
        
        # Use folder_key (plural) in URL, not file_category (singular)
        relative_url = f"/uploads/attachments/{folder_key}/{unique_filename}"
        
        # Debug logging to verify correct folder assignment
        print(f"File upload: {file.filename} -> category: {file_category} -> folder_key: {folder_key} -> folder: {target_dir} -> URL: {relative_url}")
    
    # Save file
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return file_path, relative_url


def save_base64_image(base64_data: str, category: str = 'profile') -> Tuple[Path, str]:
    """
    Save base64 image to appropriate directory.
    
    Args:
        base64_data: Base64 encoded image string (with or without data URL prefix)
        category: Either 'profile' for profile images or 'attachment' for attachments
        
    Returns:
        Tuple of (file_path, relative_url)
    """
    initialize_directories()
    
    # Remove data URL prefix if present
    if ',' in base64_data:
        header, base64_data = base64_data.split(',', 1)
        # Extract file extension from header
        if 'png' in header:
            ext = '.png'
        elif 'jpeg' in header or 'jpg' in header:
            ext = '.jpg'
        elif 'gif' in header:
            ext = '.gif'
        elif 'webp' in header:
            ext = '.webp'
        else:
            ext = '.png'  # Default
    else:
        ext = '.png'  # Default for raw base64
    
    unique_filename = f"{uuid.uuid4()}{ext}"
    
    if category == 'profile':
        file_path = PROFILE_IMAGES_DIR / unique_filename
        relative_url = f"/uploads/profile_images/{unique_filename}"
    else:
        file_path = ATTACHMENT_SUBDIRS['images'] / unique_filename
        relative_url = f"/uploads/attachments/images/{unique_filename}"
    
    # Decode and save base64 data
    image_data = base64.b64decode(base64_data)
    with file_path.open("wb") as f:
        f.write(image_data)
    
    return file_path, relative_url


def get_file_path(relative_url: str) -> Optional[Path]:
    """
    Get absolute file path from relative URL.
    
    Args:
        relative_url: Relative URL like '/uploads/profile_images/filename.jpg' or 'uploads/profile_images/filename.jpg'
        
    Returns:
        Path object or None if not found
    """
    # Remove leading slash if present
    if relative_url.startswith('/'):
        relative_url = relative_url[1:]
    
    # Remove 'uploads/' prefix if present since UPLOADS_DIR already points to uploads
    if relative_url.startswith('uploads/'):
        relative_url = relative_url[8:]  # Remove 'uploads/' prefix
    
    # Construct path: UPLOADS_DIR is already the uploads directory
    file_path = UPLOADS_DIR / relative_url
    return file_path if file_path.exists() and file_path.is_file() else None


def delete_file(relative_url: str) -> bool:
    """
    Delete a file by its relative URL.
    
    Args:
        relative_url: Relative URL of the file to delete
        
    Returns:
        True if deleted successfully, False otherwise
    """
    file_path = get_file_path(relative_url)
    if file_path and file_path.exists():
        try:
            file_path.unlink()
            return True
        except Exception as e:
            print(f"Error deleting file: {e}")
            return False
    return False


def get_file_size(file_path: Path) -> str:
    """Get human-readable file size."""
    size_bytes = file_path.stat().st_size
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"

