import React from "react";
import Svg, { Path } from "react-native-svg";

interface TriangleCrescentIconProps {
  size?: number;
  color?: string;
}

export function TriangleCrescentIcon({
  size = 48,
  color = "#D4A843",
}: TriangleCrescentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Path
        d="M55 6 A20 20 0 1 0 55 46 A14 14 0 1 1 55 6Z"
        fill={color}
      />
      <Path
        d="M50 38 L18 94 L82 94 Z"
        fill={color}
      />
    </Svg>
  );
}
