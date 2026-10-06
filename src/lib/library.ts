import { useEffect, useState } from 'react'
import type { PhotoMockup } from '../types'

// Photo mockups are shared across every project: set the corners once, reuse for each client.
const KEY = 'marque.mockups.v1'
const listeners = new Set<(m: PhotoMockup[]) => void>()

function read(): PhotoMockup[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as PhotoMockup[]
  } catch {
    return []
  }
}

let current = read()

export function saveLibrary(next: PhotoMockup[]) {
  current = next
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((l) => l(next))
}

export function useLibrary() {
  const [lib, setLib] = useState(current)
  useEffect(() => {
    listeners.add(setLib)
    return () => {
      listeners.delete(setLib)
    }
  }, [])
  return lib
}

export function getLibrary() {
  return current
}
