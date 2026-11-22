#!/bin/zsh
# Which files in your Vivaldi profile change, and by how much, while you
# use Vivaldi. Read-only: it only looks at file sizes and times.
#
#   scripts/disk-writes.sh        watch for 60 seconds
#   scripts/disk-writes.sh 300    watch for 5 minutes
#
# A file that's rewritten in full shows its whole size each time it changes,
# so a big file near the top that changes often is what fills the disk.
set -euo pipefail

SECS=${1:-60}
P="$HOME/Library/Application Support/Vivaldi"
pgrep -xq Vivaldi || { echo "Vivaldi isn't running."; exit 1; }

snap() {
  find "$P" -type f -not -path '*/Cache/*' -not -path '*/Code Cache/*' -not -path '*/GPUCache/*' -print0 2>/dev/null \
    | xargs -0 stat -f '%m %z %N' 2>/dev/null
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Sample every 5 s, so a file rewritten several times is counted each time.
snap > "$tmp/0"
n=$(( SECS / 5 )); (( n < 1 )) && n=1
echo "Watching $P for ${SECS}s…"
for i in $(seq 1 $n); do sleep 5; snap > "$tmp/$i"; done

python3 -I - "$tmp" "$n" "$P/" <<'EOF'
import sys, collections
d, n, root = sys.argv[1], int(sys.argv[2]), sys.argv[3]
def load(i):
    out = {}
    for line in open(f'{d}/{i}', errors='ignore'):
        m, z, name = line.rstrip('\n').split(' ', 2)
        out[name] = (int(m), int(z))
    return out
prev = load(0)
writes, size, changes = collections.Counter(), {}, collections.Counter()
for i in range(1, n + 1):
    cur = load(i)
    for name, (m, z) in cur.items():
        if name not in prev or prev[name][0] != m:
            # Grew: count the growth (appended). Otherwise: rewritten in full.
            grew = name in prev and z >= prev[name][1] and z - prev[name][1] < z
            writes[name] += (z - prev[name][1]) if grew and name.endswith('.log') else z
            changes[name] += 1
            size[name] = z
    prev = cur
total = sum(writes.values())
mb = lambda b: f'{b / 1e6:8.2f} MB'
print(f'\n~{mb(total).strip()} written in {n * 5}s  (~{total / (n * 5) / 1e3:.0f} KB/s)\n')
print(f'{"written":>11}  {"times":>5}  {"size":>11}  file')
for name, b in writes.most_common(15):
    print(f'{mb(b)}  {changes[name]:>5}  {mb(size[name])}  {name.replace(root, "")}')
EOF
