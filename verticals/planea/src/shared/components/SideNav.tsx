import { NavLink, Route } from 'react-router-dom'
import { SparklesIcon, UserCircleIcon, ScaleIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { SparklesIcon as SparklesIconSolid, UserCircleIcon as UserCircleIconSolid, ScaleIcon as ScaleIconSolid, ChartBarIcon as ChartBarIconSolid } from '@heroicons/react/24/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useAuth } from '../../features/auth/hooks/AuthProvider'

const tabs = [
  {
    label: 'Mi Planea',
    to: '/home',
    Icon: SparklesIcon,
    IconActive: SparklesIconSolid,
  },
  {
    label: 'Progreso',
    to: '/progress',
    Icon: ChartBarIcon,
    IconActive: ChartBarIconSolid,
  },
  {
    label: 'Patrimonio',
    to: '/patrimony',
    Icon: ScaleIcon,
    IconActive: ScaleIconSolid,
  },
  {
    label: 'Perfil',
    to: '/profile',
    Icon: UserCircleIcon,
    IconActive: UserCircleIconSolid,
  },
]

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

export function SideNav() {
  const { user, signOut } = useAuth()

  const fullName: string = user?.user_metadata?.full_name ?? user?.email ?? ''
  const initials = fullName.length > 0 ? getInitials(fullName) : ''
  const displayName = fullName.length > 0 ? getDisplayName(fullName) : ''

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // ignore
    }
  }

  return (
    <aside className="hidden 2xl:flex h-screen w-60 shrink-0 flex-col bg-(--primary-300)">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="h-8 w-8 overflow-hidden rounded-lg ring-1 ring-white">
          <img
            src="/images/logo_800x800.jpeg"
            alt="Planea"
            className="h-full w-full object-cover"
          />
        </div>
        <span className="text-2xl font-bold tracking-[-0.02em] text-white">Planea</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {tabs.map(({ label, to, Icon, IconActive }) => (
          <NavLink
            key={to}
            to={to}
            exact
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors text-white/60 hover:bg-white/8 hover:text-white"
            activeClassName="!bg-white/15 !font-bold !text-white"
          >
            <Route path={to} exact>
              {({ match }) => (
                <>
                  {match
                    ? <IconActive className="size-5 shrink-0" aria-hidden="true" />
                    : <Icon className="size-5 shrink-0" aria-hidden="true" />
                  }
                  <span>{label}</span>
                </>
              )}
            </Route>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="bg-black/20 px-4 py-3">
        <Menu as="div" className="relative">
          <MenuButton className="flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/8 cursor-pointer">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-white capitalize">{displayName}</p>
              <div className="flex items-center gap-1 text-xs text-[#B7E4C7]">
                <span className="h-1.25 w-1.25 rounded-full bg-[#52C97B]" />
                Plan activo
              </div>
            </div>
          </MenuButton>

          <MenuItems
            transition
            className="absolute bottom-full left-0 z-10 mb-2 w-44 origin-bottom-left rounded-lg bg-white py-1 shadow-lg outline outline-black/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
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
        </Menu>
      </div>
    </aside>
  )
}
