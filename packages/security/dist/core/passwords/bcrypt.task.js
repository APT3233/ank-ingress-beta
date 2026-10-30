import bcrypt from 'bcryptjs';
export default {
    async 'security.bcrypt.hash'(payload) {
        return bcrypt.hash(payload.password, payload.cost);
    },
    async 'security.bcrypt.compare'(payload) {
        return bcrypt.compare(payload.password, payload.hash);
    },
};
