import struct, zlib, os

def write_png(path, width, height, rows_rgb):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xffffffff)

    raw = b''
    for row in rows_rgb:
        raw += b'\x00' + row  # filter byte

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def make_rows(size):
    rows = []
    m = size // 5
    for y in range(size):
        row = b''
        for x in range(size):
            if m <= x < size - m and m <= y < size - m:
                row += bytes([6, 182, 212])   # cyan
            else:
                row += bytes([9, 11, 17])     # dark bg
        rows.append(row)
    return rows


base = os.path.join(os.path.dirname(__file__), 'src-tauri', 'icons')
os.makedirs(base, exist_ok=True)

write_png(os.path.join(base, '32x32.png'),       32,  32,  make_rows(32))
write_png(os.path.join(base, '128x128.png'),     128, 128, make_rows(128))
write_png(os.path.join(base, '128x128@2x.png'),  256, 256, make_rows(256))
print('PNG icons written')
