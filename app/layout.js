import './globals.css'
import { ConfirmProvider } from '@/components/ConfirmProvider'

export const metadata = {
  title: 'StockFlow',
  description: 'Multi-store inventory management',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css"
        />
      </head>
      <body>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </body>
    </html>
  )
}
