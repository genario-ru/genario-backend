import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP } from "better-auth/plugins";

import { db, schema } from "@/db";
import { sendEmail } from "@/domains/mail/services/send-email";
import { env } from "@/env";
import { TRUSTED_ORIGINS } from "@/shared/constants/api/trusted-origins";
import {
  APP_NAME,
  APP_NAME_CAPITALIZED,
} from "@/shared/constants/common/app-info";
import {
  getFixedSignInOtp,
  parseFixedSignInOtps,
} from "@/shared/utils/auth/fixed-sign-in-otps";

export type AuthType = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
};

const fixedSignInOtps = parseFixedSignInOtps(
  env.BETTER_AUTH_FIXED_SIGN_IN_OTPS,
);

export const auth = betterAuth({
  basePath: "/api/v1/auth",
  appName: APP_NAME_CAPITALIZED,
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendEmail({
        to: user.email,
        userId: user.id,
        templateKey: "email_verification",
        payload: { url, token },
      });
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      marketingAccepted: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: true,
      },
      hideOnboarding: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: true,
      },
    },
    deleteUser: {
      enabled: true,
    },
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
  },
  session: {
    storeSessionInDatabase: true,
    preserveSessionInDatabase: true,
  },
  plugins: [
    emailOTP({
      disableSignUp: env.BETTER_AUTH_DISABLE_SIGN_UP,
      storeOTP: "encrypted",
      generateOTP({ email, type }) {
        if (type === "sign-in") {
          return getFixedSignInOtp(fixedSignInOtps, email);
        }
      },
      async sendVerificationOTP({ email, otp, type }) {
        await sendEmail({
          to: email,
          templateKey: "otp",
          payload: { otp, type },
        });
      },
    }),
    // An admin is any user assigned the admin role or any user whose ID is included in the adminUserIds option
    admin({
      defaultRole: "user", // Default
      adminRoles: ["admin"], // Default
      impersonationSessionDuration: 60 * 60, // 1 hour (Default)
      defaultBanReason: "Без причины", // Not default
      defaultBanExpiresIn: undefined, // Default
      bannedUserMessage: "Ваш аккаунт был заблокирован", // Not default
    }),
  ],
  trustedOrigins: TRUSTED_ORIGINS,
  advanced: {
    database: {
      generateId: "uuid",
    },
    defaultCookieAttributes: {
      sameSite: "none",
    },
    cookiePrefix: APP_NAME,
  },
});
