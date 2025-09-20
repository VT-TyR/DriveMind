const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSet = jest.fn();

const mockDoc = jest.fn(() => ({
  get: mockGet,
  update: mockUpdate,
  delete: mockDelete,
  set: mockSet,
}));

const mockCollection = jest.fn(() => ({
  doc: mockDoc,
}));

const mockFirestore = {
  collection: mockCollection,
  FieldValue: {
    serverTimestamp: jest.fn(() => 'MOCKED_TIMESTAMP'),
  },
};

const firebaseAdmin = {
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockFirestore),
  auth: {
    user: jest.fn(),
  },
};

export default firebaseAdmin;
