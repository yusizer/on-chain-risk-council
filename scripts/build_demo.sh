#!/usr/bin/env bash
set +e

FF=/tmp/opencode/ffmpeg
DIR=demo-videos
W=1280
H=800
SPEED=0.2   # x5

mk_plate () {
  local out="$1" dur="$2"
  $FF -y -hide_banner -f lavfi -i "color=c=0x0f172a:s=${W}x${H}:r=25:d=$dur" \
    -t $dur -pix_fmt yuv420p "$out" 2>/tmp/opencode/plate.err
  if [ ! -s "$out" ]; then echo "PLATE FAIL $out"; cat /tmp/opencode/plate.err; fi
}

# whole clip sped up, no pan, no subtitles
speedclip () {
  local in="$1" out="$2" sp="$3"
  $FF -y -hide_banner -i "$in" \
    -vf "setpts=${sp}*PTS" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -r 25 "$out" 2>/tmp/opencode/s.err
  if [ ! -s "$out" ]; then echo "SPEED FAIL $out"; cat /tmp/opencode/s.err; fi
}

cd "$DIR" || exit 1
rm -f *.ass card_*.mp4 seg_*.mp4 live_*.mp4 demo-final.mp4 demo-voiced-final.mp4

mk_plate card_intro.mp4 1.5
mk_plate card_outro.mp4 1.5

speedclip clip-r1.webm live_r1.mp4 $SPEED
speedclip clip-r2.webm live_r2.mp4 $SPEED
speedclip clip-r0.webm live_r0.mp4 $SPEED
# bench: keep original speed (already ~7s, readable dashboard)
$FF -y -hide_banner -i clip-bench.webm -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -r 25 live_bench.mp4 2>/tmp/opencode/s.err
if [ ! -s live_bench.mp4 ]; then echo "BENCH FAIL"; cat /tmp/opencode/s.err; fi

echo "=== durations ==="
for f in card_intro live_r1 live_r2 live_r0 live_bench card_outro; do
  echo -n "$f: "; $FF -hide_banner -i $f.mp4 2>&1 | grep Duration
done

# compute durations dynamically, build xfade chain with correct offsets
FD=0.4
dur () { $FF -hide_banner -i "$1" 2>&1 | grep -oE "Duration: [0-9:.]+" | head -1 | awk '{print $2}' | awk -F: '{print ($1*3600)+($2*60)+$3}'; }

D0=$(dur card_intro.mp4); D1=$(dur live_r1.mp4); D2=$(dur live_r2.mp4); D3=$(dur live_r0.mp4); D4=$(dur live_bench.mp4); D5=$(dur card_outro.mp4)
echo "durs: intro=$D0... r1=$D1 r2=$D2 r0=$D3 bench=$D4 outro=$D5"

# correct: offset_k = prev_len - FD ; prev_len accumulates offset+Dk each step
LEN=$D0
O1=$(awk "BEGIN{printf \"%.2f\", $LEN-$FD}"); LEN=$(awk "BEGIN{printf \"%.2f\", $O1+$D1}")
O2=$(awk "BEGIN{printf \"%.2f\", $LEN-$FD}"); LEN=$(awk "BEGIN{printf \"%.2f\", $O2+$D2}")
O3=$(awk "BEGIN{printf \"%.2f\", $LEN-$FD}"); LEN=$(awk "BEGIN{printf \"%.2f\", $O3+$D3}")
O4=$(awk "BEGIN{printf \"%.2f\", $LEN-$FD}"); LEN=$(awk "BEGIN{printf \"%.2f\", $O4+$D4}")
O5=$(awk "BEGIN{printf \"%.2f\", $LEN-$FD}"); TOT=$(awk "BEGIN{printf \"%.2f\", $O5+$D5}")
echo "offsets: $O1 $O2 $O3 $O4 $O5  total~$TOT"

$FF -y -hide_banner \
  -i card_intro.mp4 -i live_r1.mp4 -i live_r2.mp4 -i live_r0.mp4 -i live_bench.mp4 -i card_outro.mp4 \
  -filter_complex "\
[0][1]xfade=transition=fade:duration=$FD:offset=$O1[01];\
[01][2]xfade=transition=fade:duration=$FD:offset=$O2[012];\
[012][3]xfade=transition=fade:duration=$FD:offset=$O3[0123];\
[0123][4]xfade=transition=fade:duration=$FD:offset=$O4[01234];\
[01234][5]xfade=transition=fade:duration=$FD:offset=$O5[outv]" \
  -map "[outv]" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -r 25 -movflags +faststart demo-final.mp4
echo "=== video ==="
$FF -hide_banner -i demo-final.mp4 2>&1 | grep Duration

echo "=== voiceover ==="
$FF -y -hide_banner -i demo-final.mp4 -i "ElevenLabs_2026-07-09T13_58_50_Michael - Genuine and Approachable_pvc_s50_m2.mp3" \
  -filter_complex "[1:a]atrim=0:${TOT},asetpts=PTS-STARTPTS[a]" -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 128k -shortest demo-voiced-final.mp4 2>/dev/null
$FF -hide_banner -i demo-voiced-final.mp4 2>&1 | grep -E "Duration|Stream"
