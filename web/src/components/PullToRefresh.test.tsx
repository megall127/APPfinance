import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

describe('PullToRefresh', () => {
  it('renderiza os filhos dentro do main', () => {
    render(
      <PullToRefresh onRefresh={() => Promise.resolve()}>
        <p>conteúdo da página</p>
      </PullToRefresh>,
    )
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
