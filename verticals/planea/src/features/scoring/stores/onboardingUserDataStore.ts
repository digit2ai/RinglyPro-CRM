import { create } from 'zustand'

interface UserData {
  email: string | null
}

interface UserStore {
  userData: UserData
  setEmail: (email: string) => void
  clearUser: () => void
}

const initialUserData: UserData = {
  email: null,
}

export const useOnboardingUserDataStore = create<UserStore>(set => ({
  userData: initialUserData,
  setEmail: email => set(state => ({ userData: { ...state.userData, email } })),
  clearUser: () => set({ userData: initialUserData }),
}))
