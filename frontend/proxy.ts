import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = ['/login', '/reset-password', '/change-password', '/setup-2fa']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('access_token')?.value

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/app', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
