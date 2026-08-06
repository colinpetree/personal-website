export function setMetaDescription(description) {
  let tag = document.querySelector('meta[name="description"]')
  if (!description) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'description')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', description)
}
