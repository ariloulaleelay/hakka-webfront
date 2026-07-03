import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MarkdownContent } from '../components/MarkdownContent'

function getKatexHtml(content) {
  const { container } = render(<MarkdownContent content={content} />)
  return container.innerHTML
}

describe('debug math', () => {
  it('inline math $E=mc^2$', () => {
    const html = getKatexHtml('Test $E = mc^2$ here')
    console.log('INLINE MATH HTML:', html)
    expect(true).toBe(true)
  })

  it('display math $$...$$', () => {
    const html = getKatexHtml('$$\zeta(s) = \sum_{n=1}^{\infty} \frac{1}{n^s}$$')
    console.log('DISPLAY MATH HTML:', html)
    expect(true).toBe(true)
  })

  it('formula inside backticks', () => {
    const html = getKatexHtml('Test `$E = mc^2$` here')
    console.log('BACKTICK WRAPPED HTML:', html)
    expect(true).toBe(true)
  })
})
