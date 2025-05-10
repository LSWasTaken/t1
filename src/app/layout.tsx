import './globals.css'
import { Inter } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { AuthProvider } from '@/lib/auth'
import React, { ReactNode } from 'react';

const ClientLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <div>{children}</div>;
};

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Tanza Fighter',
  description: 'game where you fight your way to the top!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} font-press-start antialiased`}>
        <AuthProvider>
          <ClientLayout>
            {children}
            <ToastContainer
              position="bottom-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="dark"
            />
          </ClientLayout>
        </AuthProvider>
      </body>
    </html>
  )
} 