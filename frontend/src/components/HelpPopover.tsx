import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface HelpPopoverProps {
  text: string
  position?: 'top' | 'right' | 'bottom' | 'left'
}

// Custom mathematical typesetting engine parsing LaTeX commands into beautifully styled React DOM trees
function renderMath(str: string): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let i = 0
  
  while (i < str.length) {
    // 1. Detect fractions: \frac{num}{den} or \\frac{num}{den}
    const fracMatch = str.slice(i).match(/^\\+frac/)
    if (fracMatch) {
      const fracLen = fracMatch[0].length
      
      // Find start of numerator
      let numStart = i + fracLen
      while (numStart < str.length && str[numStart] !== '{') {
        numStart++
      }
      
      if (numStart < str.length) {
        let braceCount = 1
        let numEnd = numStart + 1
        while (numEnd < str.length && braceCount > 0) {
          if (str[numEnd] === '{') braceCount++
          else if (str[numEnd] === '}') braceCount--
          numEnd++
        }
        
        const numeratorStr = str.slice(numStart + 1, numEnd - 1)
        
        // Find start of denominator
        let denStart = numEnd
        while (denStart < str.length && str[denStart] !== '{') {
          denStart++
        }
        
        if (denStart < str.length) {
          braceCount = 1
          let denEnd = denStart + 1
          while (denEnd < str.length && braceCount > 0) {
            if (str[denEnd] === '{') braceCount++
            else if (str[denEnd] === '}') braceCount--
            denEnd++
          }
          
          const denominatorStr = str.slice(denStart + 1, denEnd - 1)
          
          // Render Fraction with horizontal division rule
          result.push(
            <span key={`frac_${i}`} className="inline-flex flex-col items-center align-middle mx-1 leading-none select-none">
              <span className="text-[11.5px] pb-0.5 border-b border-cyan-800/40 px-1.5 font-mono text-cyan-300">
                {renderMath(numeratorStr)}
              </span>
              <span className="text-[11px] pt-0.5 px-1.5 font-mono text-cyan-400">
                {renderMath(denominatorStr)}
              </span>
            </span>
          )
          
          i = denEnd
          continue
        }
      }
    }
    
    // 2. Detect text formatting blocks: \text{...} or \\text{...}
    const textMatch = str.slice(i).match(/^\\+text/)
    if (textMatch) {
      const textLen = textMatch[0].length
      
      let start = i + textLen
      while (start < str.length && str[start] !== '{') {
        start++
      }
      if (start < str.length) {
        let braceCount = 1
        let end = start + 1
        while (end < str.length && braceCount > 0) {
          if (str[end] === '{') braceCount++
          else if (str[end] === '}') braceCount--
          end++
        }
        const textContent = str.slice(start + 1, end - 1)
        result.push(
          <span key={`text_${i}`} className="font-sans font-normal text-gray-300 mx-0.5 select-none">
            {textContent}
          </span>
        )
        i = end
        continue
      }
    }

    // 3. Handle subscripts (_) and superscripts (^)
    let char = str[i]
    if (char === '_') {
      let subStart = i + 1
      if (str[subStart] === '{') {
        let braceCount = 1
        let subEnd = subStart + 1
        while (subEnd < str.length && braceCount > 0) {
          if (str[subEnd] === '{') braceCount++
          else if (str[subEnd] === '}') braceCount--
          subEnd++
        }
        const subContent = str.slice(subStart + 1, subEnd - 1)
        result.push(
          <sub key={`sub_${i}`} className="text-[8.5px] text-cyan-400 font-mono align-sub -ml-0.5 select-none">
            {renderMath(subContent)}
          </sub>
        )
        i = subEnd
        continue
      } else {
        result.push(
          <sub key={`sub_${i}`} className="text-[8.5px] text-cyan-400 font-mono align-sub -ml-0.5 select-none">
            {str[subStart]}
          </sub>
        )
        i = subStart + 1
        continue
      }
    }

    if (char === '^') {
      let supStart = i + 1
      if (str[supStart] === '{') {
        let braceCount = 1
        let supEnd = supStart + 1
        while (supEnd < str.length && braceCount > 0) {
          if (str[supEnd] === '{') braceCount++
          else if (str[supEnd] === '}') braceCount--
          supEnd++
        }
        const supContent = str.slice(supStart + 1, supEnd - 1)
        result.push(
          <sup key={`sup_${i}`} className="text-[8.5px] text-cyan-300 font-mono align-super -ml-0.5 select-none">
            {renderMath(supContent)}
          </sup>
        )
        i = supEnd
        continue
      } else {
        result.push(
          <sup key={`sup_${i}`} className="text-[8.5px] text-cyan-300 font-mono align-super -ml-0.5 select-none">
            {str[supStart]}
          </sup>
        )
        i = supStart + 1
        continue
      }
    }

    // 4. Match common LaTeX symbols & Greek operators
    let matchedSymbol = false
    const symbols = [
      { latex: '\\mathbb{E}', unicode: '𝔼' },
      { latex: '\\mathbb{INR}', unicode: '₹' },
      { latex: '\\mathcal{H}', unicode: 'ℋ' },
      { latex: '\\hat{\\mathbb{E}}', unicode: '𝔼̂' },
      { latex: '\\hat{A}', unicode: 'Â' },
      { latex: '\\epsilon', unicode: 'ε' },
      { latex: '\\theta', unicode: 'θ' },
      { latex: '\\gamma', unicode: 'γ' },
      { latex: '\\alpha', unicode: 'α' },
      { latex: '\\pi', unicode: 'π' },
      { latex: '\\phi', unicode: 'φ' },
      { latex: '\\sigma', unicode: 'σ' },
      { latex: '\\sum', unicode: '∑' },
      { latex: '\\cdot', unicode: '·' },
      { latex: '\\times', unicode: '×' },
      { latex: '\\subseteq', unicode: '⊆' },
      { latex: '\\setminus', unicode: ' \\ ' },
      { latex: '\\min', unicode: 'min' },
      { latex: '\\max', unicode: 'max' },
      { latex: '\\log', unicode: 'log' },
      { latex: '\\ge', unicode: '≥' },
      { latex: '\\le', unicode: '≤' },
      
      // Double escaped support
      { latex: '\\\\mathbb{E}', unicode: '𝔼' },
      { latex: '\\\\mathbb{INR}', unicode: '₹' },
      { latex: '\\\\mathcal{H}', unicode: 'ℋ' },
      { latex: '\\\\hat{\\\\mathbb{E}}', unicode: '𝔼̂' },
      { latex: '\\\\hat{A}', unicode: 'Â' },
      { latex: '\\\\epsilon', unicode: 'ε' },
      { latex: '\\\\theta', unicode: 'θ' },
      { latex: '\\\\gamma', unicode: 'γ' },
      { latex: '\\\\alpha', unicode: 'α' },
      { latex: '\\\\pi', unicode: 'π' },
      { latex: '\\\\phi', unicode: 'φ' },
      { latex: '\\\\sigma', unicode: 'σ' },
      { latex: '\\\\sum', unicode: '∑' },
      { latex: '\\\\cdot', unicode: '·' },
      { latex: '\\\\times', unicode: '×' },
      { latex: '\\\\subseteq', unicode: '⊆' },
      { latex: '\\\\setminus', unicode: ' \\ ' },
      { latex: '\\\\min', unicode: 'min' },
      { latex: '\\\\max', unicode: 'max' },
      { latex: '\\\\log', unicode: 'log' },
      { latex: '\\\\ge', unicode: '≥' },
      { latex: '\\\\le', unicode: '≤' },
    ]

    for (const sym of symbols) {
      if (str.startsWith(sym.latex, i)) {
        result.push(
          <span 
            key={`sym_${i}`} 
            className={`font-mono text-cyan-300 font-extrabold select-none ${
              sym.unicode === '∑' ? 'text-[14px] align-middle px-0.5 text-cyan-400' : ''
            }`}
          >
            {sym.unicode}
          </span>
        )
        i += sym.latex.length
        matchedSymbol = true
        break
      }
    }

    if (matchedSymbol) continue

    // 5. Clean up stray backslashes
    if (char === '\\') {
      if (str[i + 1] === '\\') {
        i += 2
        continue
      }
      i++
      continue
    }

    // Default character token
    result.push(<span key={`char_${i}`} className="font-mono italic text-gray-200 select-none">{char}</span>)
    i++
  }
  return result
}

export default function HelpPopover({ text }: HelpPopoverProps) {
  const [open, setOpen] = useState(false)

  // Clean and split lines supporting both actual newlines and literal "\n" or "\\n" sequences
  const parseMarkdown = (rawText: string) => {
    const lines = rawText.split(/\r?\n|\\n/)
    return lines.map((line, idx) => {
      const trimmed = line.trim()
      if (!trimmed) return <div key={idx} className="h-2" />

      // 1. Block Formula
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
        const formula = trimmed.slice(2, -2).trim()
        return (
          <div key={idx} className="my-3.5 p-3.5 bg-gray-950/95 rounded-xl border border-cyan-800/40 text-center select-all shadow-inner leading-relaxed flex items-center justify-center gap-1 flex-wrap min-h-[44px]">
            {renderMath(formula)}
          </div>
        )
      }

      // 2. Bullet Item
      const isBullet = trimmed.startsWith('- ')
      const content = isBullet ? trimmed.substring(2) : trimmed

      // Parse bold (**bold**) and inline formula ($formula$)
      const parts = content.split(/(\*\*.*?\*\*|\$.*?\$)/g)
      const parsedElements = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-extrabold text-cyan-300">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('$') && part.endsWith('$')) {
          return (
            <span key={pIdx} className="inline-flex items-center text-cyan-400 font-mono mx-1 leading-none align-middle">
              {renderMath(part.slice(1, -1))}
            </span>
          )
        }
        return part
      })

      if (isBullet) {
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 text-[11.5px] leading-relaxed my-1">
            {parsedElements}
          </li>
        )
      }

      // Heading style if line starts with ### or ##
      if (trimmed.startsWith('### ')) {
        return (
          <h5 key={idx} className="text-xs font-bold text-gray-100 font-mono tracking-wider mt-4 mb-2 border-b border-gray-800 pb-1 uppercase">
            {trimmed.substring(4)}
          </h5>
        )
      }

      return (
        <p key={idx} className="text-gray-300 text-[11.5px] leading-relaxed my-1">
          {parsedElements}
        </p>
      )
    })
  }

  return (
    <>
      <button
        type="button"
        className="text-gray-500 hover:text-cyan-400 text-[10px] border border-gray-600 hover:border-cyan-500 rounded-full w-3.5 h-3.5 flex items-center justify-center transition-colors select-none font-bold focus:outline-none cursor-pointer hover:bg-cyan-950/10 active:scale-95"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        title="Click for details"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop Overlay with blur */}
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
            />

            {/* Modal Dialog Card */}
            <motion.div
              className="relative z-[101] w-full max-w-md bg-gray-900/95 border border-cyan-800/40 rounded-2xl p-6 shadow-2xl shadow-cyan-950/80 max-h-[80vh] overflow-y-auto mx-4 animate-fadeIn"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
            >
              {/* Close Button */}
              <button
                type="button"
                className="absolute top-4 right-4 text-gray-500 hover:text-cyan-400 text-sm font-bold bg-gray-950 hover:bg-gray-800 border border-gray-800 hover:border-cyan-500/30 rounded-lg w-7 h-7 flex items-center justify-center transition-colors focus:outline-none"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                }}
              >
                ✕
              </button>

              <div className="flex flex-col text-left pr-3 mt-1">
                {parseMarkdown(text)}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
