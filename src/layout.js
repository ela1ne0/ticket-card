// Shared geometry between the 2D face painter and the 3D scene.

export const FW = 2048; // face texture size (4:3, same as the portfolio's panel art)
export const FH = 1536;
export const CARD_W = 1.0; // world units
export const CARD_H = (CARD_W * FH) / FW; // 0.75
export const ART_W = 4000; // the source illustrations are 4000x3000 "art space"
export const ART_H = 3000;

// Ticket drawn in the portfolio's CSS px (370 x ~124), scaled up by K
export const TK = { W: 370, H: 124, K: 4.3 };
export const TICKET = {
  w: TK.W * TK.K,
  h: TK.H * TK.K,
  x: (FW - TK.W * TK.K) / 2,
  y: 640,
};
// where the stamp lands (canvas px)
export const STAMP_PT = { x: TICKET.x + TICKET.w * 0.63, y: TICKET.y + TICKET.h * 0.5 };

// canvas px -> card-local world coords (origin at card centre, y up)
export const toCard = (px, py) => ({
  x: ((px - FW / 2) / FW) * CARD_W,
  y: (-(py - FH / 2) / FH) * CARD_H,
});
