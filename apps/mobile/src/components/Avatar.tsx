import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { color, radius } from '@/theme'
import { initialsFor } from '@/lib/initials'

// Circular avatar: photo when `src` is set (PRD 0008), else initials.
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 56 : 34
  const shape = { width: dim, height: dim, borderRadius: radius.pill }
  if (src) return <Image source={{ uri: src }} style={[shape, s.img]} accessibilityIgnoresInvertColors />
  return (
    <View style={[shape, s.fallback]}>
      <Text style={[s.text, { fontSize: size === 'lg' ? 22 : 14 }]}>{initialsFor(name)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  img: { resizeMode: 'cover' },
  fallback: { backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  text: { color: color.primaryInk, fontWeight: '700' },
})
