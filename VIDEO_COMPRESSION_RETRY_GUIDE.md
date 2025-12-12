# Video Compression Retry Implementation Guide

## Overview
This implementation adds the ability to retry video compression for videos that failed or were skipped during the initial compression process.

## Problem
Videos with multiple `_compressed.mp4.mp4` suffixes indicate failed compression retries. We need to:
1. Identify videos that need compression (don't have `_compressed` in URL)
2. Provide a way to manually retry compression
3. Show this information in the frontend

## Solution

### 1. Update GraphQL Schema
**File:** `src/app/trainings/training_modules/training_module_contents/training_module_content_schema.js`

**Line 87** - Add to `TrainingModuleContent` type (after `compressing: Boolean`):
```graphql
needsCompression: Boolean
```

**Line 223** - Add to mutations (before the closing backtick):
```graphql
retryVideoCompression(contentId: ID!): GenericResponse
```

### 2. Update Resolver - Add needsCompression Flag
**File:** `src/app/trainings/training_modules/training_module_contents/training_module_content_resolver.js`

**Location:** Around line 282-286 in `getTrainingModuleContents` query

**REPLACE:**
```javascript
return {
    ...content,
    createdBy: decryptedCreatedBy,
    updatedBy: decryptedUpdatedBy,
};
```

**WITH:**
```javascript
// Check if video needs compression (VIDEO type and URL doesn't contain '_compressed')
let needsCompression = false;
if (content.contentType === 'VIDEO' && content.videos && content.videos.length > 0) {
    needsCompression = content.videos.some(video => !video.url.includes('_compressed'));
}

return {
    ...content,
    createdBy: decryptedCreatedBy,
    updatedBy: decryptedUpdatedBy,
    needsCompression: needsCompression,
};
```

### 3. Add Retry Mutation
**File:** `src/app/trainings/training_modules/training_module_contents/training_module_content_resolver.js`

**Location:** At the end of `module.exports.mutations` object (before the closing brace on line 2211)

**ADD:**
```javascript
retryVideoCompression: async ({ contentId }, context) => {
    const { subscriberId } = AuthUser(context);

    try {
        if (!contentId) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Content ID is required");
        }

        // Find the content
        const content = await TrainingModuleContent.findOne({
            _id: contentId,
            subscriber: subscriberId,
            contentType: 'VIDEO',
            isDeleted: false
        });

        if (!content) {
            throw CustomError(ErrorName.NOT_FOUND, "Video content not found");
        }

        // Check if any video needs compression
        const videosNeedingCompression = content.videos.filter(video => !video.url.includes('_compressed'));

        if (videosNeedingCompression.length === 0) {
            return {
                status: 0,
                message: "All videos are already compressed"
            };
        }

        // Set compressing flag
        content.compressing = true;
        await content.save();

        // Send to SQS queue for compression
        const jobId = uuidv4();
        
        async function compressVideoJob(jobData) {
            try {
                if (!jobData || !jobData.jobId) {
                    throw new Error('Invalid job data: missing jobId');
                }

                const params = {
                    QueueUrl: process.env.SQS_VIDEO_COMPRESSION_QUEUE_URL,
                    MessageBody: JSON.stringify(jobData),
                };

                const data = await sqsClient.send(new SendMessageCommand(params));

                console.log(`📋 Retry compression job sent to SQS: ${data.MessageId}`);
                return { id: data.MessageId };
            } catch (error) {
                console.error('❌ Failed to send retry job to SQS:', error);
                throw error;
            }
        }

        await compressVideoJob({
            jobId,
            savedContent: { _id: content._id }
        });

        console.log(`✅ Video compression retry initiated for content ${contentId}`);

        return {
            status: 1,
            message: `Video compression retry initiated successfully. ${videosNeedingCompression.length} video(s) will be compressed.`
        };

    } catch (error) {
        console.error("Error in retryVideoCompression:", error);
        throw CustomError(ErrorName.FAILED, error.message);
    }
},
```

## Frontend Usage

### GraphQL Query
When fetching training module contents, the response will now include `needsCompression`:

```graphql
query GetTrainingModuleContents {
    getTrainingModuleContents {
        contents {
            _id
            title {
                lang
                value
            }
            contentType
            needsCompression  # NEW FIELD
            videos {
                url
            }
        }
    }
}
```

### GraphQL Mutation
To retry compression:

```graphql
mutation RetryVideoCompression($contentId: ID!) {
    retryVideoCompression(contentId: $contentId) {
        status
        message
    }
}
```

### UI Implementation
```javascript
// In your content list component
{content.needsCompression && (
    <Button 
        onClick={() => retryCompression(content._id)}
        variant="warning"
    >
        Retry Compression
    </Button>
)}

// Handler function
const retryCompression = async (contentId) => {
    try {
        const result = await retryVideoCompressionMutation({ 
            variables: { contentId } 
        });
        
        if (result.data.retryVideoCompression.status === 1) {
            toast.success(result.data.retryVideoCompression.message);
        } else {
            toast.info(result.data.retryVideoCompression.message);
        }
    } catch (error) {
        toast.error('Failed to retry compression');
    }
};
```

## How It Works

1. **Detection**: 
   - `needsCompression` flag is set to `true` if video URL doesn't contain `_compressed`
   - This means the video was never compressed or compression failed

2. **Retry Process**:
   - Frontend shows "Retry Compression" button for videos with `needsCompression: true`
   - User clicks button → calls `retryVideoCompression` mutation
   - Backend validates content exists and is a VIDEO type
   - Filters videos that need compression
   - Sets `compressing: true` flag
   - Sends job to SQS video compression queue
   - Existing worker processes the compression

3. **Worker Processing**:
   - Existing `video_compression_worker.js` handles the compression
   - Downloads original video from S3
   - Compresses using FFmpeg
   - Uploads compressed version with `_compressed.mp4` suffix
   - Updates database with new URL
   - Sets `compressing: false`

## Testing

1. **Find videos needing compression**:
```graphql
query {
    getTrainingModuleContents(contentType: [VIDEO]) {
        contents {
            _id
            title { value }
            needsCompression
            videos { url }
        }
    }
}
```

2. **Retry compression for a specific content**:
```graphql
mutation {
    retryVideoCompression(contentId: "YOUR_CONTENT_ID") {
        status
        message
    }
}
```

3. **Monitor worker logs** to see compression progress

## Benefits

✅ **Manual Control**: Admins can retry failed compressions  
✅ **Visual Indicator**: Frontend shows which videos need compression  
✅ **No Breaking Changes**: Uses existing compression infrastructure  
✅ **Idempotent**: Safe to retry multiple times  
✅ **Clear Feedback**: Returns status and message to user  

## Notes

- Videos with `_compressed` in URL are considered already compressed
- The retry will only compress videos that don't have `_compressed` in their URL
- Multiple `_compressed.mp4.mp4` suffixes indicate the bug happened before - these are already compressed and won't be re-compressed
- The SQS worker should be running for compression to work
- Check `SQS_VIDEO_COMPRESSION_QUEUE_URL` environment variable is set correctly
