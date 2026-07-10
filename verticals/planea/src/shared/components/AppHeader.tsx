import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useAuth } from '../../features/auth/hooks/AuthProvider'

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getDisplayName(fullName: string): string {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export function AppHeader({ hideUser = false, dark = false }: { hideUser?: boolean; dark?: boolean }) {
  const { user, signOut } = useAuth()

  const fullName: string = user?.user_metadata?.full_name ?? user?.email ?? ''
  const initials = fullName.length > 0 ? getInitials(fullName) : ''
  const displayName = fullName.length > 0 ? getDisplayName(fullName) : ''

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cerrar sesión.'
      console.error(message)
    }
  }

  return (
    <header className="w-full bg-(--primary-300) px-5 py-4 2xl:hidden">
      <div className="flex items-center justify-between">
        {/* Logo + título */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 overflow-hidden rounded-lg ring-1 ring-white">
            <img
              src="/images/logo_800x800.jpeg"
              alt="Planea"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-2xl font-bold tracking-[-0.02em] text-white">Planea</span>
        </div>

        {/* Usuario */}
        {!hideUser && <Menu as="div" className="relative">
          <MenuButton className="flex items-center gap-2 cursor-pointer">
            {/* Info textual */}
            <div className="text-right">
              <p className="text-base font-semibold text-white capitalize">{displayName}</p>
              <div className="flex items-center justify-end gap-1 text-sm text-[#B7E4C7]">
                <span className="h-1.25 w-1.25 rounded-full bg-[#52C97B]" />
                Plan activo
              </div>
            </div>

            {/* Avatar con inicial */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/35 bg-white/15 text-sm font-bold text-white">
              {initials}
            </div>
          </MenuButton>

          <MenuItems
            transition
            className="absolute right-0 z-10 mt-2 w-44 origin-top-right rounded-lg bg-white py-1 shadow-lg outline outline-black/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
          >
            <MenuItem>
              <button
                onClick={handleSignOut}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 data-focus:bg-gray-50 data-focus:text-gray-900 cursor-pointer"
              >
                Cerrar sesión
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>}
      </div>
    </header>
  )
}
