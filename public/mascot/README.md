# 파란 곰돌이 에셋

- `brand.png`: 사용자의 기존 DANB 파란 곰돌이 원본. 투명 RGBA PNG.
- `states.png`: 기존 원본을 참조해 built-in ImageGen으로 만든 3칸 가로 스프라이트. 투명 RGBA PNG. 왼쪽부터 차분한 탐색 / 집중·생각 / 시간 재생. 화면에서는 배경을 추가하지 않고 같은 크기로 표시한다.
- `src/style.css`의 `.bear-frame`과 `[data-state]`가 표정을 선택한다. 화면 읽기용 상태 안내는 실제 텍스트로 별도 제공한다.
- 지진 발생을 기뻐하거나 위험·안전을 판정하는 표정을 사용하지 않는다. 표정은 사용자의 탐색·선택·재생 동작에만 반응한다.
- 브랜드 원본과 파생 이미지의 권리는 코드의 MIT 라이선스로 재허가하지 않는다.

## 생성 프롬프트

Built-in image generation, transparent background, reference `danb-bear.png`:

> Use case: identity-preserve. Asset type: ONE horizontal 3-cell transparent PNG mascot sprite sheet for a minimal earthquake explorer app. The input image is the exact blue bear identity reference: preserve its round face proportions, vivid royal blue gradient, small circular blue ears, black vertical oval eyes, warm cream oval muzzle and peach cheeks, friendly small black nose, soft polished 3D illustration style. Create three equally sized isolated head-and-small-paws vignettes arranged left-to-right in an exactly even 3-column horizontal sheet, equal character size and alignment, generous transparent gutters. The same identical bear in every cell, not three different characters. Left cell: calm neutral smile, tiny blue/gray seismograph dial held below chin. Center cell: attentive thoughtful expression with a subtle raised eyebrow, small magnifier examining the same seismograph below chin. Right cell: gently pleased and attentive expression with slightly smiling eyes, holding the same seismograph with a small blue playback triangle as a state cue. No cheering or alarm expressions. This app explores historical records; avoid implying an earthquake is safe, dangerous, or good news. Keep the face recognizable and nearly unchanged; variations are subtle expressions and props. Real transparent alpha everywhere outside the characters and props; no background, no colored rectangles, no sticker outline, no shadows extending into background, no typography, no watermark. The output is one wide sprite sheet with three equal-width cells for CSS background positions.
