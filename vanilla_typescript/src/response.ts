import { TroubledToken } from './token';
export type ApiResponse<T> = {
    data: T;
    failures: TroubledToken[];
};

