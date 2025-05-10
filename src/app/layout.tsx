'use client';

import './globals.css'
import { Inter } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { AuthProvider } from '@/lib/auth'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

const inter = Inter({ subsets: ['latin'] })

function Navigation() {
  const { user, signOut } = useAuth();

  return (
    <nav className="bg-cyber-dark p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-press-start text-cyber-pink">
          Tanza Fighter
        </Link>
        <div className="flex items-center space-x-4">
          {user ? (
            <>
              <Link
                href="/profile"
                className="text-cyber-blue hover:text-cyber-purple transition-colors"
              >
                Profile
              </Link>
              <Link
                href="/game"
                className="text-cyber-blue hover:text-cyber-purple transition-colors"
              >
                Game
              </Link>
              <button
                onClick={() => signOut()}
                className="text-cyber-pink hover:text-cyber-purple transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-cyber-pink hover:text-cyber-purple transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export const metadata = {
  title: 'Tanza Fighter - Cyberpunk Clicker Game',
  
  description: 'A cyberpunk-themed clicker game where you fight your way to the top!',
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
          <Navigation />
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
        </AuthProvider>
      </body>
    </html>
  )
} 