
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef, useState } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'

export default function App() {
  const store = createTLStore({ shapeUtils: defaultShapeUtils })
  const editorRef = useRef(null)
  const [dark, setDark] = useState(true)

  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (!editorRef.current) return
      const snapshot = editorRef.current.store.getSnapshot()
      localStorage.setItem('nava-disha-bts-autosave', JSON.stringify(snapshot))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const saveBoard = () => {
    const snapshot = editorRef.current.store.getSnapshot()
    const blob = new Blob([JSON.stringify(snapshot)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nava-disha-bts.board'
    a.click()
  }

  const loadBoard = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    const text = await file.text()
    editorRef.current.store.loadSnapshot(JSON.parse(text))
  }

  const exportPNG = async () => {
    const editor = editorRef.current
    const svg = await editor.getSvg()
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = 'nava-disha-bts.png'
      a.click()
    }
    img.src = url
  }

  const addDecision = () => {
    editorRef.current.createShape({
      type: 'geo',
      x: 200,
      y: 200,
      props: {
        geo: 'diamond',
        w: 200,
        h: 120,
        text: 'Decision'
      }
    })
  }

  const addDatabase = () => {
    editorRef.current.createShape({
      type: 'geo',
      x: 300,
      y: 300,
      props: {
        geo: 'ellipse',
        w: 220,
        h: 140,
        text: 'Database (3D Cylinder Style)'
      }
    })
  }

  const addCodeBlock = () => {
    const code = `function example() {
  return true;
}`
    editorRef.current.createShape({
      type: 'geo',
      x: 400,
      y: 200,
      props: {
        geo: 'rectangle',
        w: 350,
        h: 200,
        text: code,
        color: 'blue',
        fill: 'semi'
      }
    })
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveBoard()
      }
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        exportPNG()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div className="toolbar">
        <button onClick={saveBoard}>Save</button>
        <button onClick={exportPNG}>Export PNG</button>
        <input type="file" onChange={loadBoard} />
        <button onClick={addDecision}>Decision</button>
        <button onClick={addDatabase}>Database</button>
        <button onClick={addCodeBlock}>Code</button>
        <button onClick={() => setDark(!dark)}>Toggle Theme</button>
      </div>

      <Tldraw
        store={store}
        autoFocus
        onMount={(editor) => {
          editorRef.current = editor
          editor.updateInstanceState({ isGridMode: true })
        }}
        darkMode={dark}
        showMinimap={true}
      />
    </div>
  )
}
