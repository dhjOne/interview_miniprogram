export default [
  {
    path: '/api/repository/user/social/profile',
    data: {
      userId: 'u1',
      nickname: '面试小能手',
      avatar: '/static/avatar1.png',
      bio: '每天刷题进步一点点，专注 Java 后端与系统设计',
      followingCount: 12,
      followerCount: 38,
      publishCount: 4,
      likeCount: 128,
      isFollowing: false
    }
  },
  {
    path: '/api/repository/user/social/questions',
    data: {
      rows: [
        { id: 'q101', title: 'Redis 持久化 RDB 与 AOF 如何选择？', viewCount: 1204, likeCount: 86, commentCount: 12, createdAt: '2025-05-10' },
        { id: 'q102', title: 'MySQL 索引下推 ICP 原理', viewCount: 892, likeCount: 45, commentCount: 8, createdAt: '2025-05-08' },
        { id: 'q103', title: '分布式锁 Redisson 实现要点', viewCount: 2103, likeCount: 132, commentCount: 24, createdAt: '2025-05-01' },
        { id: 'q104', title: 'Spring 循环依赖三级缓存', viewCount: 1560, likeCount: 98, commentCount: 15, createdAt: '2025-04-22' }
      ],
      total: 4
    }
  }
];
