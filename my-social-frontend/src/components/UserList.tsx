import React from "react";

interface User {
  id: number;
  username: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  is_online?: boolean;
}

interface UserListProps {
  users: User[];
  selectedUser: User | null;
  onUserSelect: (user: User | null) => void;
  isConnected: boolean;
}

const UserList: React.FC<UserListProps> = ({ users, selectedUser, onUserSelect, isConnected }) => {
  const handleUserClick = (user: User) => {
    if (selectedUser?.id === user.id) {
      onUserSelect(null);
      console.log('User deselected:', user);
    } else {
      onUserSelect(user);
      console.log('User selected:', user);
    }
  };

  return (
    <div className="w-80 min-w-[18rem] max-w-xs h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#181818] flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold">Users</h2>
        <div className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div className="flex-1">
        {users.length === 0 ? (
          <div className="p-4 text-gray-500">No users available.</div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              onClick={() => handleUserClick(user)}
              className={`p-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                selectedUser?.id === user.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={`${user.username}'s avatar`}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {(user.display_name || user.first_name || user.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Status dot */}
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: user.is_online ? '#22c55e' : '#a3a3a3' }}></div>
                  {/* End status dot */}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-black truncate">{user.display_name || user.first_name || user.username}</div>
                  <div className="text-sm text-gray-500">@{user.username}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UserList;