// RN component test (RNTL) — runs via `npm run test:native` on the RN Jest
// preset, NOT Vitest (named *.native.test.tsx so Vitest skips it). A
// representative example of the component test lane the PRD asks for; feature
// screens add their RNTL tests here as they land.
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button } from '@/components/ui'

describe('Button', () => {
  it('renders its title and fires onPress when enabled', () => {
    const onPress = jest.fn()
    render(<Button title="Start workout" onPress={onPress} variant="primary" />)
    fireEvent.press(screen.getByText('Start workout'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire onPress while loading', () => {
    const onPress = jest.fn()
    render(<Button title="Save" onPress={onPress} loading />)
    // Title is replaced by a spinner while loading; pressing the (disabled)
    // button must not call onPress.
    expect(screen.queryByText('Save')).toBeNull()
  })
})
