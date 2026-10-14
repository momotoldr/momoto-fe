/** Where to PUT one file of a direct-to-R2 upload, and the `Content-Type` signed into it. */
export interface DirectUploadTarget {
  url: string
  contentType: string
}
