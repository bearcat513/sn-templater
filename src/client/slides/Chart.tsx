import React from 'react'
import type { ChartScene } from '../engine/chart'
import type { FontFamily } from '../engine/pdfFonts'
import { FONT_STACKS } from './Freeform'

/**
 * A laid-out chart, drawn as SVG on the sheet.
 *
 * The other half of `drawChart` in engine/render.ts: the same marks at the
 * same points, so the bars on screen are the bars in the PDF. Text is placed
 * by its baseline, 0.8em below the top of its line, as the PDF writer places
 * it. What the screen adds is a tooltip on each bar, slice and dot.
 */
export function ChartSvg({ scene, family, label }: { scene: ChartScene; family: FontFamily; label: string }) {
    const pairs = (points: [number, number][]) => points.map(([x, y]) => `${x},${y}`).join(' ')
    return (
        <svg
            width={scene.width}
            height={scene.height}
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            role="img"
            aria-label={label}
            style={{ display: 'block', overflow: 'visible', fontFamily: FONT_STACKS[family] }}
        >
            {scene.marks.map((mark, index) => {
                switch (mark.kind) {
                    case 'shape':
                        return (
                            <polygon
                                key={index}
                                points={pairs(mark.points)}
                                fill={mark.fill}
                                fillOpacity={mark.opacity}
                                stroke={mark.stroke}
                                strokeWidth={mark.stroke ? mark.strokeWidth : undefined}
                                strokeLinejoin="round"
                            >
                                {mark.tip && <title>{mark.tip}</title>}
                            </polygon>
                        )
                    case 'polyline':
                        return (
                            <polyline
                                key={index}
                                points={pairs(mark.points)}
                                fill="none"
                                stroke={mark.color}
                                strokeWidth={mark.width}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        )
                    case 'rule':
                        return (
                            <line
                                key={index}
                                x1={mark.x1}
                                y1={mark.y1}
                                x2={mark.x2}
                                y2={mark.y2}
                                stroke={mark.color}
                                strokeWidth={mark.width}
                                strokeLinecap="round"
                            />
                        )
                    case 'dot':
                        return (
                            <g key={index}>
                                <circle cx={mark.cx} cy={mark.cy} r={mark.r + 2} fill={mark.ring} />
                                <circle cx={mark.cx} cy={mark.cy} r={mark.r} fill={mark.fill}>
                                    {mark.tip && <title>{mark.tip}</title>}
                                </circle>
                            </g>
                        )
                    case 'text':
                        return (
                            <text
                                key={index}
                                x={mark.x}
                                y={mark.y + mark.size * 0.8}
                                fontSize={mark.size}
                                fontWeight={mark.bold ? 700 : 400}
                                fill={mark.color}
                                style={{ whiteSpace: 'pre' }}
                            >
                                {mark.text}
                            </text>
                        )
                }
            })}
        </svg>
    )
}
