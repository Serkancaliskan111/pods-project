import React, { useMemo } from 'react'
import { View, StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { palette } from '../../theme/palette'

/** @param {string} chatBg @param {string} [doodleColor] */
export default function ChatRoomWallpaper({ chatBg = palette.slate[100], doodleColor = 'rgba(0,0,0,0.045)' }) {
  const { width, height } = useWindowDimensions()

  const glyphs = useMemo(
    () => [
      { x: 0.08, y: 0.12, d: 'M4 12a8 8 0 1 0 16 0', o: 1 },
      { x: 0.22, y: 0.28, d: 'M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z', o: 0.9 },
      { x: 0.45, y: 0.08, d: 'M12 21c4.4 0 8-3.6 8-8s-3.6-8-8-8-8 3.6-8 8 3.6 8 8 8z', o: 1 },
      { x: 0.68, y: 0.18, d: 'M4 20 L20 4', o: 0.85 },
      { x: 0.84, y: 0.32, d: 'M8 12h8M12 8v8', o: 1 },
      { x: 0.14, y: 0.52, d: 'M6 18c0-4 3-7 6-7s6 3 6 7', o: 0.9 },
      { x: 0.38, y: 0.44, d: 'M4 16 Q12 4 20 16', o: 0.85 },
      { x: 0.58, y: 0.58, d: 'M10 10h4v4h-4z', o: 1 },
      { x: 0.78, y: 0.48, d: 'M12 2v20M2 12h20', o: 0.8 },
      { x: 0.06, y: 0.78, d: 'M8 8l8 8M16 8l-8 8', o: 0.9 },
      { x: 0.28, y: 0.72, d: 'M12 4l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z', o: 0.85 },
      { x: 0.5, y: 0.82, d: 'M6 14c2-4 10-4 12 0', o: 1 },
      { x: 0.72, y: 0.68, d: 'M4 12h16', o: 0.88 },
      { x: 0.9, y: 0.84, d: 'M12 6a6 6 0 1 0 0 12', o: 0.95 },
    ],
    [],
  )

  const dots = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        cx: ((i * 47) % 100) / 100,
        cy: ((i * 61) % 100) / 100,
        r: 1 + (i % 2),
        o: 0.65 + (i % 4) * 0.08,
      })),
    [],
  )

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} fill={chatBg} />
        {dots.map((dot, i) => (
          <Circle
            key={`d-${i}`}
            cx={dot.cx * width}
            cy={dot.cy * height}
            r={dot.r}
            fill={doodleColor}
            opacity={dot.o}
          />
        ))}
        {glyphs.map((g, i) => (
          <Path
            key={`g-${i}`}
            d={g.d}
            stroke={doodleColor}
            strokeWidth={1.2}
            fill="none"
            opacity={g.o}
            transform={`translate(${g.x * width - 12}, ${g.y * height - 12}) scale(0.9)`}
          />
        ))}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
  },
})
