"""
Creates icon.ico containing the 32x32 PNG as an embedded PNG entry.
ICO with embedded PNG works on Windows Vista+ (which Tauri targets).
"""
import struct, os

base = os.path.join(os.path.dirname(__file__), 'src-tauri', 'icons')
png_path = os.path.join(base, '32x32.png')
ico_path = os.path.join(base, 'icon.ico')

with open(png_path, 'rb') as f:
    png_data = f.read()

# ICO file: header + 1 directory entry + image data
# Header: reserved(2) + type(2) + count(2)
header = struct.pack('<HHH', 0, 1, 1)

png_size = len(png_data)
data_offset = 6 + 16  # header + one directory entry

# Directory entry: width(1) height(1) colorCount(1) reserved(1) planes(2) bitCount(2) bytesInRes(4) imageOffset(4)
# width/height = 0 means 256 for ICO, but 32 means 32
dir_entry = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, png_size, data_offset)

with open(ico_path, 'wb') as f:
    f.write(header)
    f.write(dir_entry)
    f.write(png_data)

print(f'icon.ico written ({os.path.getsize(ico_path)} bytes)')
