const authEn = {
  login: {
    form: {
      title: 'Sign In',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      hidePassword: 'Hide password',
      showPassword: 'Show password',
      submittingButton: 'Signing in...',
      submitButton: 'Sign in',
    },
    links: {
      noAccountText: "Don't have an account?",
      registerLink: 'Sign up',
      forgotPasswordText: 'Forgot your password?',
      resetPasswordLink: 'Reset it',
      changeLanguageTitle: 'Change language',
    },
  },
  register: {
    form: {
      title: 'Create Account',
      emailLabel: 'Email',
      fullNameLabel: 'Full Name',
      passwordLabel: 'Password',
      submittingButton: 'Creating account...',
      submitButton: 'Sign up',
      fullNameRequired: 'Name is required.',
      successMessage: 'Registration successful. Check your email to confirm your account.',
    },
    links: {
      alreadyAccountText: 'Already have an account?',
      loginLink: 'Sign in',
    },
  },
  resetPassword: {
    form: {
      title: 'Reset Password',
      description: 'Enter your email and we will send you a link to reset your password.',
      emailLabel: 'Email',
      submittingButton: 'Sending...',
      submitButton: 'Send link',
    },
    links: {
      alreadyAccountText: 'Already have an account?',
      loginLink: 'Sign in',
    },
  },
  newPassword: {
    form: {
      title: 'New Password',
      description: 'Enter and confirm your new password.',
      checkingText: 'Validating link...',
      invalidLinkText: 'The link is invalid or has expired.',
      passwordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm Password',
      submittingButton: 'Saving...',
      submitButton: 'Save Password',
    },
    links: {
      alreadyAccountText: 'Already have an account?',
      loginLink: 'Sign in',
    },
  },
}

export default authEn
