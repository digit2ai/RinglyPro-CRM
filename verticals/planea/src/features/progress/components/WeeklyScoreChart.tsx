import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { ScoreWeekBucket } from '../api/scoreHistory.service'

interface Props {
  data: ScoreWeekBucket[]
}

export function WeeklyScoreChart({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (svgRef.current === null || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const marginTop = 20
    const marginBottom = 28
    const marginLeft = 30
    const marginRight = 12

    const innerWidth = width - marginLeft - marginRight
    const innerHeight = height - marginTop - marginBottom

    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, innerWidth])
      .padding(0.25)

    const maxScore = Math.min(100, (d3.max(data, d => d.score) ?? 100) + 10)

    const y = d3.scaleLinear()
      .domain([0, maxScore])
      .range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${marginTop})`)

    // Y gridlines
    g.append('g')
      .selectAll('line')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => y(d))
      .attr('y2', d => y(d))
      .attr('stroke', 'var(--gray-100)')
      .attr('stroke-width', 1)

    // Y axis labels
    g.append('g')
      .selectAll('text')
      .data(y.ticks(4))
      .join('text')
      .attr('x', -6)
      .attr('y', d => y(d) + 4)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--gray-300)')
      .attr('font-size', 10)
      .text(d => String(d))

    // Bars
    const barRadius = 4
    g.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => x(d.label) ?? 0)
      .attr('y', d => y(d.score))
      .attr('width', x.bandwidth())
      .attr('height', d => innerHeight - y(d.score))
      .attr('fill', (_d, i) => i === data.length - 1 ? '#C9A84C' : 'var(--primary-300)')
      .attr('opacity', (_d, i) => i === data.length - 1 ? 1 : 0.55)
      .attr('rx', barRadius)
      .attr('ry', barRadius)

    // Score labels above bars — always show all for monthly view (max 12)
    const scoreLabelData = data
    g.append('g')
      .selectAll('text')
      .data(scoreLabelData)
      .join('text')
      .attr('x', d => (x(d.label) ?? 0) + x.bandwidth() / 2)
      .attr('y', d => y(d.score) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', (_d, i) => i === scoreLabelData.length - 1 ? '#C9A84C' : 'var(--gray-400)')
      .attr('font-size', 10)
      .attr('font-weight', (_d, i) => i === scoreLabelData.length - 1 ? '700' : '500')
      .text(d => String(d.score))

    // X axis labels — show every Nth label to avoid overlap
    const labelStep = data.length > 14 ? 4 : data.length > 7 ? 2 : 1
    g.append('g')
      .selectAll('text')
      .data(data.filter((_d, i) => i % labelStep === 0 || i === data.length - 1))
      .join('text')
      .attr('x', d => (x(d.label) ?? 0) + x.bandwidth() / 2)
      .attr('y', innerHeight + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--gray-300)')
      .attr('font-size', 10)
      .text(d => d.label)
  }, [data])

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-(--gray-300)">
        Aún no hay registros de puntaje
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      className="h-44 w-full"
      style={{ overflow: 'visible' }}
    />
  )
}
