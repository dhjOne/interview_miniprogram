const users = [
  { userId: 'u1', nickname: '面试小能手', avatar: '/static/avatar1.png', bio: '每天刷题进步一点点' },
  { userId: 'u2', nickname: '算法练习生', avatar: '/static/avatar1.png', bio: '专注数据结构' },
  { userId: 'u3', nickname: '前端追梦人', avatar: '/static/avatar1.png', bio: 'React & 小程序' }
];

export default [
  {
    path: '/api/repository/user/social/summary',
    data: {
      followingCount: 12,
      followerCount: 38,
      visitCount: 156,
      myRank: 28
    }
  },
  {
    path: '/api/repository/user/social/following',
    data: {
      rows: users.map((u, i) => ({
        ...u,
        isFollowing: true,
        followedAt: `2025-0${i + 1}-12`
      })),
      total: users.length
    }
  },
  {
    path: '/api/repository/user/social/followers',
    data: {
      rows: users.map((u, i) => ({
        ...u,
        isFollowing: i % 2 === 0,
        followedAt: `2025-0${i + 2}-08`
      })),
      total: users.length
    }
  },
  {
    path: '/api/repository/user/social/visits',
    data: {
      rows: users.map((u, i) => ({
        ...u,
        visitAt: `2025-05-${10 + i} 14:30:00`
      })),
      total: users.length
    }
  }
];
