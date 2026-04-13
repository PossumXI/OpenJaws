import * as React from 'react'
import { Box } from '../../ink.js'
import type { FeedConfig } from './Feed.js'
import { calculateFeedWidth, Feed } from './Feed.js'

type FeedColumnProps = {
  feeds: FeedConfig[]
  maxWidth: number
}

export function FeedColumn({
  feeds,
  maxWidth,
}: FeedColumnProps): React.ReactNode {
  const feedWidths = feeds.map(feed => calculateFeedWidth(feed))
  const maxOfAllFeeds = Math.max(...feedWidths)
  const actualWidth = Math.min(maxOfAllFeeds, maxWidth)

  return (
    <Box flexDirection="column" gap={1}>
      {feeds.map((feed, index) => (
        <Feed key={index} config={feed} actualWidth={actualWidth} />
      ))}
    </Box>
  )
}
