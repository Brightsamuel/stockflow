import localFont from 'next/font/local'
import './globals.css'
import { ConfirmProvider } from '@/components/ConfirmProvider'

// Font files ship with the app (npm @fontsource-variable/*), so neither the build nor the
// browser needs to reach an outside font service
const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})
const mono = localFont({
  src: '../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata = {
  title: { default: 'StockFlow', template: '%s · StockFlow' },
  description: 'Multi-store inventory, transfers and field records',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  )
}
