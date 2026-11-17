import { createEncryptedStore } from "../store/createYmlStore";

type Credential = {
	account: string;
	password: string;
};
type Credentials = Array<Credential>;
type CredentialStore = {
	credentials: Record<string, any | null | undefined>;
};
const store = createEncryptedStore<CredentialStore>("ytm-credentials", {
	defaults: { credentials: {} },
});
class SecureStore {
	// async: an error from the encrypted store now rejects instead of leaving the caller waiting forever.
	async getAll(): Promise<Credentials> {
		return Object.entries(store.get("credentials", {})).map(([account, password]) => ({ account, password }) as Credential);
	}
	async set(key: string, value: string): Promise<string | null> {
		store.set(`credentials.${key}`, value);
		return value;
	}
	async get<T = any>(key: string): Promise<T | null> {
		return store.get(`credentials.${key}`, null) as T | null;
	}
	async delete(key: string): Promise<boolean> {
		store.delete(`credentials.${key}`);
		return true;
	}
}

const secureStore = new SecureStore();
export default secureStore;
