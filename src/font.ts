// arcade-kit's 5x7 font, drawn as JTRIS always drew it: lower-case b is a capital B here, not the
// kit's flat sign, and the glyphs JTRIS never had (# ' * =) stay blank, e.g. in names from the world table.
import { drawText as kitDrawText, textWidth } from 'arcade-kit/font';

export { textWidth };

const plain = (s: string) => s.replace(/b/g, 'B').replace(/[#'*=]/g, ' ');

export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color?: string) {
  kitDrawText(ctx, plain(s), x, y, color);
}

export function drawTextCentered(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, color?: string) {
  drawText(ctx, s, Math.round(cx - textWidth(s) / 2), y, color);
}
