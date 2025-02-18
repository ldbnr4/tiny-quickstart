import { AccountBase } from "plaid";

export interface AccountLink {
    item_id: string,
    institution_id: string,
    name: string,
    url: string,
    institution_logo: string,
    accounts: xAccountBase[],
}

export interface xAccountBase extends AccountBase {
    asset_class: string,
    institution_id: string,
}

export interface AccountLinkResponse {
    institution_id: string,
    name: string,
    url: string,
    institution_logo: string,
    accounts: AccountResponse[],
}

export interface AccountResponse {
    id: string,
    name: string,
    official_name: string,
    available_balance: number,
    current_balance: number,
    type: string,
    sub_type: string,
    asset_class: string,
    institution_id: string,
}