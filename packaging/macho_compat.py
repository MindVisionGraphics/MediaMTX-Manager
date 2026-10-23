"""Read Mach-O deployment targets and dylib dependencies without executing code."""
import struct


def version(value):
    return [value >> 16, (value >> 8) & 255, value & 255]


def inspect(content):
    if content[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        wide = content[:4] == b'\xca\xfe\xba\xbf'
        count = struct.unpack_from('>I', content, 4)[0]
        records = []
        for i in range(count):
            base = 8 + i * (32 if wide else 20)
            offset, size = struct.unpack_from('>QQ' if wide else '>II', content, base + 8)
            records.extend(inspect(content[offset:offset + size]))
        return records
    if content[:4] not in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe'):
        return []
    cpu, _, filetype, ncmds = struct.unpack_from('<IIII', content, 4)
    position = 32 if content[:4] == b'\xcf\xfa\xed\xfe' else 28
    result = {'architecture': {0x1000007: 'x64', 0x100000c: 'arm64'}.get(cpu, hex(cpu)),
              'filetype': filetype, 'minimum': None, 'libraries': []}
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', content, position)
        if size < 8 or position + size > len(content):
            raise ValueError('Invalid Mach-O load command')
        if cmd == 0x32:
            platform, minimum = struct.unpack_from('<II', content, position + 8)
            if platform != 1:
                raise ValueError('Expected macOS platform')
            result['minimum'] = version(minimum)
        elif cmd == 0x24:
            result['minimum'] = version(struct.unpack_from('<I', content, position + 8)[0])
        elif cmd in (0xc, 0x80000018, 0x8000001f, 0x80000023):
            offset = struct.unpack_from('<I', content, position + 8)[0]
            name = content[position + offset:position + size].split(b'\0')[0].decode()
            result['libraries'].append({'path': name, 'weak': cmd == 0x80000018})
        position += size
    return [result]
