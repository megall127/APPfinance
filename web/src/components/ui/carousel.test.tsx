import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Carousel, CarouselItem } from './carousel'

describe('Carousel', () => {
  beforeEach(() => {
    // jsdom não implementa Element.prototype.scrollTo
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
  })

  it('renderiza um dot por item', () => {
    render(
      <Carousel>
        <CarouselItem>A</CarouselItem>
        <CarouselItem>B</CarouselItem>
        <CarouselItem>C</CarouselItem>
      </Carousel>,
    )
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('clicar num dot rola até o painel', () => {
    render(
      <Carousel>
        <CarouselItem>A</CarouselItem>
        <CarouselItem>B</CarouselItem>
      </Carousel>,
    )
    fireEvent.click(screen.getByLabelText('Ir para o painel 2'))
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
  })
})
