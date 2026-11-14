// Cartes Uno dessinées en CSS (design original, aux couleurs de 3ajib Games).

import type { UnoCard, UnoColor } from "@3ajib/uno";
import "./uno.css";

export const CARD_COLORS: Record<UnoColor, string> = {
  red: "#e8394a",
  yellow: "#ffc12e",
  green: "#22b573",
  blue: "#2f7cf0",
};

function symbol(card: UnoCard): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "skip":
      return "⊘";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild":
      return "";
    case "wild4":
      return "+4";
  }
}

export function CardFace({
  card,
  size = "md",
  playable,
  onClick,
  className = "",
  title,
  dataId,
}: {
  card: UnoCard;
  size?: "sm" | "md" | "lg";
  playable?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  dataId?: number;
}) {
  const wild = card.kind === "wild" || card.kind === "wild4";
  const bg = wild ? "#14152b" : CARD_COLORS[card.color!];
  const sym = symbol(card);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`uno-card ${size} ${wild ? "wild" : ""} ${playable ? "playable" : ""} ${onClick ? "clickable" : ""} ${className}`}
      style={{ ["--c" as string]: bg }}
      onClick={onClick}
      title={title}
      aria-label={title}
      data-card={dataId}
    >
      <span className="corner tl">{sym || "★"}</span>
      <span className="oval">
        {wild && <span className="wheel" aria-hidden />}
        {sym && <span className={`big ${sym.length > 1 ? "long" : ""}`}>{sym}</span>}
      </span>
      <span className="corner br">{sym || "★"}</span>
    </Tag>
  );
}

export function CardBack({ size = "md", className = "", style }: { size?: "sm" | "md" | "lg"; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`uno-card back ${size} ${className}`} style={style}>
      <span className="back-logo">3AJIB</span>
    </div>
  );
}
