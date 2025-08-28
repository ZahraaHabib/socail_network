'use client';

import GroupChat from '@/components/GroupChat';
import { useState } from 'react';

export default function TestGroupChatPage() {
  const [groupId, setGroupId] = useState(1);
  const [currentUserId, setCurrentUserId] = useState(1);

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Group Chat Test</h1>
      
      <div className="mb-6 flex gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Group ID:</label>
          <input
            type="number"
            value={groupId}
            onChange={(e) => setGroupId(Number(e.target.value))}
            className="border rounded px-3 py-2 w-24"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Current User ID:</label>
          <input
            type="number"
            value={currentUserId}
            onChange={(e) => setCurrentUserId(Number(e.target.value))}
            className="border rounded px-3 py-2 w-24"
          />
        </div>
      </div>

      <div className="max-w-2xl">
        <GroupChat groupId={groupId} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
