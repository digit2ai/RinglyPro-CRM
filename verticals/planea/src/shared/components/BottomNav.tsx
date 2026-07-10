import { NavLink, Route } from 'react-router-dom'
import { SparklesIcon, UserCircleIcon, ScaleIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { SparklesIcon as SparklesIconSolid, UserCircleIcon as UserCircleIconSolid, ScaleIcon as ScaleIconSolid, ChartBarIcon as ChartBarIconSolid } from '@heroicons/react/24/solid'

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

export function BottomNav() {
  return (
    <nav className="w-full bg-white">
      <ul className="flex h-16">
        {tabs.map(({ label, to, Icon, IconActive }) => (
          <li key={to} className="flex flex-1">
            <NavLink
              to={to}
              exact
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors text-(--gray-300) hover:text-(--gray-400)"
              activeClassName="!text-(--secondary3-400)"
            >
              <Route path={to} exact>
                {({ match }) => (
                  <>
                    {match ? (
                      <IconActive className="size-6" aria-hidden="true" />
                    ) : (
                      <Icon className="size-6" aria-hidden="true" />
                    )}
                    <span>{label}</span>
                  </>
                )}
              </Route>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
