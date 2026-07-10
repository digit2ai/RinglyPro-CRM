const authEs = {
  login: {
    form: {
      title: 'Iniciar Sesión',
      emailLabel: 'Correo electrónico',
      passwordLabel: 'Contraseña',
      hidePassword: 'Ocultar contraseña',
      showPassword: 'Mostrar contraseña',
      submittingButton: 'Ingresando...',
      submitButton: 'Ingresar',
    },
    links: {
      noAccountText: '¿No tienes cuenta?',
      registerLink: 'Regístrate',
      forgotPasswordText: '¿Olvidaste tu contraseña?',
      resetPasswordLink: 'Reestáblecela',
      changeLanguageTitle: 'Cambiar idioma',
    },
  },
  register: {
    form: {
      title: 'Crear Cuenta',
      emailLabel: 'Correo electrónico',
      fullNameLabel: 'Nombre Completo',
      passwordLabel: 'Contraseña',
      submittingButton: 'Registrando...',
      submitButton: 'Registrarse',
      fullNameRequired: 'El nombre es obligatorio.',
      successMessage: 'Registro exitoso. Revisa tu correo para confirmar tu cuenta.',
    },
    links: {
      alreadyAccountText: '¿Ya tienes cuenta?',
      loginLink: 'Inicia sesión',
    },
  },
  resetPassword: {
    form: {
      title: 'Restablecer Contraseña',
      description: 'Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.',
      emailLabel: 'Correo electrónico',
      submittingButton: 'Enviando...',
      submitButton: 'Enviar enlace',
    },
    links: {
      alreadyAccountText: '¿Ya tienes cuenta?',
      loginLink: 'Inicia sesión',
    },
  },
  newPassword: {
    form: {
      title: 'Nueva Contraseña',
      description: 'Ingresa y confirma tu nueva contraseña.',
      checkingText: 'Validando enlace...',
      invalidLinkText: 'El enlace no es válido o expiró.',
      passwordLabel: 'Nueva Contraseña',
      confirmPasswordLabel: 'Confirmar Contraseña',
      submittingButton: 'Guardando...',
      submitButton: 'Guardar Contraseña',
    },
    links: {
      alreadyAccountText: '¿Ya tienes cuenta?',
      loginLink: 'Inicia sesión',
    },
  },
}

export default authEs
