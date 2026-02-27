import { Request } from 'express';

export const hasRole = (req: Request, role: string) => {
    return req.user?.roles.includes(role) ?? false;
};

export const isAdmin = (req: Request) => hasRole(req, 'ADMIN');

export const isApprover = (req: Request) => hasRole(req, 'APPROVER');

export const isIssuer = (req: Request) => hasRole(req, 'ISSUER');
