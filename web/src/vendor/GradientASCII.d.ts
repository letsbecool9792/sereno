import type { CSSProperties, FC } from "react";

export interface GradientASCIIProps {
  colors?: string[];
  shape?: "horizon" | "pinch" | "rise" | "eclipse";
  /// A density ramp, light to heavy.
  characters?: string;
  cellSize?: number;
  density?: number;
  glyphOpacity?: number;
  glow?: number;
  depthOfField?: number;
  flicker?: number;
  softness?: number;
  scale?: number;
  flow?: number;
  speed?: number;
  gradientOpacity?: number;
  grain?: number;
  variation?: number;
  mouseInteraction?: boolean;
  scrambleRadius?: number;
  clickEffect?: "none" | "wave" | "burst";
  intro?: boolean;
  lightMode?: boolean;
  fontFamily?: string;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

declare const GradientASCII: FC<GradientASCIIProps>;
export default GradientASCII;
